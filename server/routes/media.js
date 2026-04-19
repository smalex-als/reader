import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_VOICE, MAX_UPLOAD_BYTES, voiceProfiles } from '../config.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import { loadPageText, savePageText } from '../lib/ocr.js';
import {
  createPageAudioStream,
  createTextAudioStream,
  handlePageAudio,
  handleTextAudio,
  resolvePageAudioOutput
} from '../lib/audio.js';
import { createBookFromPdf } from '../lib/pdf.js';
import { invalidateSearchIndexForImage } from '../lib/search.js';
import { generateXaiTtsDebugFile } from '../lib/xaiTts.js';

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
  const requestedVoiceId =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];
  const result = await handlePageAudio({
    image,
    voiceProfile,
    provider: provider === 'xai' ? 'xai' : 'openai'
  });
  res.json(result);
}));

router.post('/api/text-audio', asyncHandler(async (req, res) => {
  const { text, voice, provider } = req.body || {};
  const requestedVoiceId =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];
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
  const requestedVoiceId =
    typeof voiceParam === 'string' && voiceParam.trim().length ? voiceParam.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];

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
  const requestedVoiceId =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];
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
