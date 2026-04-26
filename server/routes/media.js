import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DEFAULT_STREAM_VOICE,
  DEFAULT_VOICE,
  LOCAL_STREAM_VOICES,
  MAX_UPLOAD_BYTES,
  XAI_STREAM_VOICES,
  voiceProfiles
} from '../config.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import { loadPageText, savePageText } from '../lib/ocr.js';
import {
  createPageAudioStream,
  createTextAudioStream,
  createTextPcmSpeechStream,
  handlePageAudio,
  handleTextAudio,
  resolvePageAudioOutput
} from '../lib/audio.js';
import { createBookFromPdf } from '../lib/pdf.js';
import { invalidateSearchIndexForImage } from '../lib/search.js';
import {
  createTextPcmStream,
  createTextWavStream,
  PCM_STREAM_BIT_DEPTH,
  PCM_STREAM_CHANNEL_COUNT,
  PCM_STREAM_MIME_TYPE,
  PCM_STREAM_SAMPLE_RATE
} from '../lib/streamAudio.js';
import { generateXaiTtsDebugFile, generateXaiTtsPcmBuffer } from '../lib/xaiTts.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function toNodeReadableStream(streamBody) {
  if (!streamBody) {
    return null;
  }
  if (typeof streamBody.pipe === 'function') {
    return streamBody;
  }
  if (typeof streamBody.getReader === 'function') {
    return Readable.fromWeb(streamBody);
  }
  return null;
}

async function writeStreamResponse(stream, res, setHeaders) {
  let started = false;

  for await (const chunk of stream) {
    if (!chunk || chunk.length === 0) {
      continue;
    }
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
}

function setPcmStreamHeaders(res) {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Audio-Format', 'pcm_s16le');
  res.setHeader('X-Audio-Sample-Rate', String(PCM_STREAM_SAMPLE_RATE));
  res.setHeader('X-Audio-Channels', String(PCM_STREAM_CHANNEL_COUNT));
  res.setHeader('X-Audio-Bit-Depth', String(PCM_STREAM_BIT_DEPTH));
}

function resolveVoiceProfile(voice) {
  const requestedVoiceId =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  if (voiceProfiles[requestedVoiceId]) {
    return voiceProfiles[requestedVoiceId];
  }
  return voiceProfiles[DEFAULT_VOICE];
}

function formatProviderVoiceLabel(voice) {
  return `${voice.charAt(0).toUpperCase()}${voice.slice(1)}`;
}

function formatLocalVoiceLabel(voice) {
  const withoutLocale = voice.slice(3);
  const [name, variant] = withoutLocale.split('_');
  return variant ? `${name} - ${variant}` : name;
}

function createStreamVoiceOptions() {
  return [
    ...Object.entries(voiceProfiles).map(([id, profile]) => ({
      id,
      label: `${formatProviderVoiceLabel(id)} - OpenAI (${profile.openAiVoice})`,
      provider: 'openai',
      openAiVoice: profile.openAiVoice
    })),
    ...XAI_STREAM_VOICES.map((voice) => ({
      id: `xai_${voice}`,
      label: `${formatProviderVoiceLabel(voice)} - xAI`,
      provider: 'xai',
      xaiVoice: voice
    })),
    ...LOCAL_STREAM_VOICES.map((id) => ({
      id,
      label: formatLocalVoiceLabel(id),
      provider: 'streaming'
    }))
  ];
}

router.get('/api/stream-audio/voices', (_req, res) => {
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

router.post('/api/page-audio', asyncHandler(async (req, res) => {
  const { image, voice, provider } = req.body || {};
  if (!image) {
    throw createHttpError(400, 'Image is required');
  }
  const voiceProfile = resolveVoiceProfile(voice);
  const result = await handlePageAudio({
    image,
    voiceProfile,
    provider: provider === 'xai' ? 'xai' : 'openai'
  });
  res.json(result);
}));

router.post('/api/text-audio', asyncHandler(async (req, res) => {
  const { text, voice, provider } = req.body || {};
  const voiceProfile = resolveVoiceProfile(voice);
  const result = await handleTextAudio({
    text,
    voiceProfile,
    provider: provider === 'xai' ? 'xai' : 'openai',
    voice: typeof voice === 'string' ? voice.trim() : ''
  });
  res.json(result);
}));

router.get('/api/page-audio/stream', asyncHandler(async (req, res) => {
  const image = req.query.image;
  if (!image || typeof image !== 'string') {
    throw createHttpError(400, 'Image is required');
  }

  const voiceParam = req.query.voice;
  const voiceProfile = resolveVoiceProfile(voiceParam);

  const speech = await createPageAudioStream({ image, voiceProfile });
  const contentType = speech.headers.get('content-type') || 'audio/mpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  const { audioAbsolute } = resolvePageAudioOutput(image);
  const tempAudioPath = `${audioAbsolute}.part-${Date.now()}-${process.pid}`;

  const bodyStream = toNodeReadableStream(speech.body);
  if (bodyStream) {
    await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });

    const streamForClient = new PassThrough();
    const streamForFile = new PassThrough();
    bodyStream.pipe(streamForClient);
    bodyStream.pipe(streamForFile);

    try {
      await Promise.all([
        pipeline(streamForClient, res),
        pipeline(streamForFile, createWriteStream(tempAudioPath))
      ]);
      await fs.rename(tempAudioPath, audioAbsolute);
    } catch (error) {
      await fs.rm(tempAudioPath, { force: true }).catch(() => {});
      throw error;
    }
    return;
  }

  const fallback = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
  await fs.writeFile(tempAudioPath, fallback);
  await fs.rename(tempAudioPath, audioAbsolute);
  res.end(fallback);
}));

router.post('/api/text-audio/stream', asyncHandler(async (req, res) => {
  const { text, voice } = req.body || {};
  const voiceProfile = resolveVoiceProfile(voice);
  const speech = await createTextAudioStream({ text, voiceProfile });
  const contentType = speech.headers.get('content-type') || 'audio/mpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');

  const bodyStream = toNodeReadableStream(speech.body);
  if (bodyStream) {
    await pipeline(bodyStream, res);
    return;
  }

  const fallback = Buffer.from(await speech.arrayBuffer());
  res.end(fallback);
}));

router.post('/api/stream-audio/pcm', asyncHandler(async (req, res) => {
  const { text, voice } = req.body || {};
  const requestedVoice =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoice];
  const xaiVoice = requestedVoice.startsWith('xai_') ? requestedVoice.slice(4) : '';
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    if (voiceProfile) {
      const speech = await createTextPcmSpeechStream({
        text,
        voiceProfile
      });
      const bodyStream = toNodeReadableStream(speech.body);
      if (bodyStream) {
        await writeStreamResponse(bodyStream, res, () => setPcmStreamHeaders(res));
        return;
      }
      const fallback = Buffer.from(await speech.arrayBuffer());
      setPcmStreamHeaders(res);
      res.end(fallback);
      return;
    }
    if (XAI_STREAM_VOICES.includes(xaiVoice)) {
      const pcmBuffer = await generateXaiTtsPcmBuffer({
        text,
        voice: xaiVoice,
        sampleRate: PCM_STREAM_SAMPLE_RATE
      });
      setPcmStreamHeaders(res);
      res.end(pcmBuffer);
      return;
    }

    const pcmStream = createTextPcmStream(
      text,
      typeof voice === 'string' ? voice.trim() : '',
      abortController.signal,
      requestId
    );
    await writeStreamResponse(pcmStream, res, () => setPcmStreamHeaders(res));
  } catch (error) {
    if (abortController.signal.aborted || req.aborted || !res.writable) {
      return;
    }
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    throw error;
  } finally {
    req.off('aborted', handleRequestAborted);
    res.off('close', handleResponseClosed);
  }
}));

router.post('/api/stream-audio/wav', asyncHandler(async (req, res) => {
  const { text, voice } = req.body || {};
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  } catch (error) {
    if (abortController.signal.aborted || req.aborted || !res.writable) {
      return;
    }
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
