import express from 'express';
import { DEFAULT_STREAM_VOICE, XAI_STREAM_VOICES } from '../config.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import { loadPageText, savePageText } from '../lib/ocr.js';
import { createBookFromPdf } from '../lib/pdf.js';
import { invalidateSearchIndexForImage } from '../lib/search.js';
import {
  createBufferedPcmStream,
  createTextPcmStream,
  createTextWavStream,
  estimatePcmInitialBufferSeconds,
  PCM_STREAM_BIT_DEPTH,
  PCM_STREAM_CHANNEL_COUNT,
  PCM_STREAM_MIME_TYPE,
  PCM_STREAM_SAMPLE_RATE
} from '../lib/streamAudio.js';
import { generateXaiTtsDebugFile, generateXaiTtsPcmBuffer } from '../lib/xaiTts.js';
import {
  createStreamVoiceOptions,
  TTS_PROVIDER_STREAMING,
  TTS_PROVIDER_XAI
} from '../lib/streamVoices.js';
import { createTtsLogTimer } from '../lib/ttsLog.js';
import { createMemoryUpload } from '../lib/upload.js';

const router = express.Router();
const upload = createMemoryUpload();

async function writeStreamResponse(stream, res, setHeaders) {
  let started = false;
  let bytesWritten = 0;

  for await (const chunk of stream) {
    if (!chunk || chunk.length === 0) {
      continue;
    }
    bytesWritten += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    if (!started) {
      setHeaders();
      started = true;
    }
    if (!res.write(chunk)) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          res.off('drain', handleDrain);
          res.off('error', handleError);
          res.off('close', handleClose);
        };
        const handleDrain = () => {
          cleanup();
          resolve();
        };
        const handleError = (error) => {
          cleanup();
          reject(error);
        };
        const handleClose = () => {
          cleanup();
          reject(createHttpError(499, 'Client closed request'));
        };
        res.once('drain', handleDrain);
        res.once('error', handleError);
        res.once('close', handleClose);
      });
    }
  }

  if (!started) {
    setHeaders();
  }
  res.end();
  return bytesWritten;
}

function setPcmStreamHeaders(res) {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Audio-Format', 'pcm_s16le');
  res.setHeader('X-Audio-Sample-Rate', String(PCM_STREAM_SAMPLE_RATE));
  res.setHeader('X-Audio-Channels', String(PCM_STREAM_CHANNEL_COUNT));
  res.setHeader('X-Audio-Bit-Depth', String(PCM_STREAM_BIT_DEPTH));
}

function resolvePcmTtsTarget(voice) {
  const requestedVoice =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const xaiVoice = requestedVoice.startsWith('xai_') ? requestedVoice.slice(4) : '';

  if (XAI_STREAM_VOICES.includes(xaiVoice)) {
    return {
      provider: TTS_PROVIDER_XAI,
      voice: xaiVoice,
      xaiVoice
    };
  }
  return {
    provider: TTS_PROVIDER_STREAMING,
    voice: typeof voice === 'string' && voice.trim() ? voice.trim() : DEFAULT_STREAM_VOICE,
    xaiVoice: ''
  };
}

router.get('/api/stream-audio/voices', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    defaultVoice: DEFAULT_STREAM_VOICE,
    voices: createStreamVoiceOptions()
  });
});

router.get('/api/page-text', asyncHandler(async (req, res) => {
  const image = req.query.image;
  const engine = typeof req.query.engine === 'string' ? req.query.engine : null;
  const skipCacheParam = req.query.skipCache;
  const skipCache =
    typeof skipCacheParam === 'string'
      ? ['1', 'true', 'yes'].includes(skipCacheParam.toLowerCase())
      : Array.isArray(skipCacheParam)
      ? skipCacheParam.some((value) => ['1', 'true', 'yes'].includes(String(value).toLowerCase()))
      : false;
  const result = await loadPageText(image, { skipCache, engine });
  if (result.source === 'ai') {
    await invalidateSearchIndexForImage(String(image));
  }
  res.json({ source: result.source, text: result.text });
}));

router.post('/api/page-text', asyncHandler(async (req, res) => {
  const { image, text } = req.body || {};
  if (!image) {
    throw createHttpError(400, 'Image is required');
  }
  const result = await savePageText(image, text);
  await invalidateSearchIndexForImage(image);
  res.json({ source: result.source, text: result.text });
}));

router.post('/api/stream-audio/pcm', asyncHandler(async (req, res) => {
  const { text, voice } = req.body || {};
  const target = resolvePcmTtsTarget(voice);
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const log = createTtsLogTimer({
    requestId,
    scope: 'api',
    endpoint: '/api/stream-audio/pcm',
    method: 'POST',
    provider: target.provider,
    voice: target.voice,
    format: 'pcm_s16le',
    text: typeof text === 'string' ? text : ''
  });
  const abortController = new AbortController();
  const handleRequestAborted = () => {
    abortController.abort();
  };
  const handleResponseClosed = () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };
  req.once('aborted', handleRequestAborted);
  res.once('close', handleResponseClosed);
  try {
    if (target.xaiVoice) {
      const pcmBuffer = await generateXaiTtsPcmBuffer({
        text,
        voice: target.xaiVoice,
        sampleRate: PCM_STREAM_SAMPLE_RATE
      });
      setPcmStreamHeaders(res);
      res.end(pcmBuffer);
      await log.finish({ status: 'ok', source: 'ai', responseBytes: pcmBuffer.length });
      return;
    }

    const pcmStream = createTextPcmStream(
      text,
      typeof voice === 'string' ? voice.trim() : '',
      abortController.signal,
      requestId
    );
    const bufferedPcmStream = createBufferedPcmStream(pcmStream, {
      initialBufferSeconds: estimatePcmInitialBufferSeconds(text)
    });
    const responseBytes = await writeStreamResponse(bufferedPcmStream, res, () => setPcmStreamHeaders(res));
    await log.finish({ status: 'ok', source: 'streaming', responseBytes });
  } catch (error) {
    if (abortController.signal.aborted || req.aborted || !res.writable) {
      await log.finish({ status: 'aborted', error });
      return;
    }
    if (res.headersSent) {
      await log.finish({ status: 'error', error });
      res.destroy(error);
      return;
    }
    await log.finish({ status: 'error', error });
    throw error;
  } finally {
    req.off('aborted', handleRequestAborted);
    res.off('close', handleResponseClosed);
  }
}));

router.post('/api/stream-audio/wav', asyncHandler(async (req, res) => {
  const { text, voice } = req.body || {};
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const log = createTtsLogTimer({
    requestId,
    scope: 'api',
    endpoint: '/api/stream-audio/wav',
    method: 'POST',
    provider: TTS_PROVIDER_STREAMING,
    voice: typeof voice === 'string' && voice.trim() ? voice.trim() : DEFAULT_STREAM_VOICE,
    format: 'wav',
    text: typeof text === 'string' ? text : ''
  });
  const abortController = new AbortController();
  const handleRequestAborted = () => {
    abortController.abort();
  };
  const handleResponseClosed = () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  };
  req.once('aborted', handleRequestAborted);
  res.once('close', handleResponseClosed);

  const wavStream = createTextWavStream(
    text,
    typeof voice === 'string' ? voice.trim() : '',
    abortController.signal,
    requestId
  );
  res.setHeader('Content-Type', PCM_STREAM_MIME_TYPE);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="stream-audio-streaming.wav"');
  res.setHeader('X-Audio-Streaming', 'wav');

  try {
    await pipeline(wavStream, res);
    await log.finish({ status: 'ok', source: 'streaming' });
  } catch (error) {
    if (abortController.signal.aborted || req.aborted || !res.writable) {
      await log.finish({ status: 'aborted', error });
      return;
    }
    await log.finish({ status: 'error', error });
    throw error;
  } finally {
    req.off('aborted', handleRequestAborted);
    res.off('close', handleResponseClosed);
  }
}));

router.post('/api/upload/pdf', upload.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw createHttpError(400, 'PDF file is required');
  }
  const { bookId, manifest } = await createBookFromPdf(file.buffer, file.originalname || 'book.pdf');
  res.json({ book: bookId, manifest });
}));

router.post('/api/debug/xai-tts', asyncHandler(async (req, res) => {
  const result = await generateXaiTtsDebugFile({
    text: req.body?.text,
    voice: req.body?.voice,
    language: req.body?.language,
    outputFormat: req.body?.output_format
  });
  res.json(result);
}));

export default router;
