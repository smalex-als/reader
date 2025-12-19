import express from 'express';
import multer from 'multer';
import { DEFAULT_VOICE, MAX_UPLOAD_BYTES, voiceProfiles } from '../config.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import { loadPageText } from '../lib/ocr.js';
import { handlePageAudio } from '../lib/audio.js';
import { createBookFromPdf } from '../lib/pdf.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

router.get('/api/page-text', asyncHandler(async (req, res) => {
  const image = req.query.image;
  const skipCacheParam = req.query.skipCache;
  const skipCache =
    typeof skipCacheParam === 'string'
      ? ['1', 'true', 'yes'].includes(skipCacheParam.toLowerCase())
      : Array.isArray(skipCacheParam)
      ? skipCacheParam.some((value) => ['1', 'true', 'yes'].includes(String(value).toLowerCase()))
      : false;
  const result = await loadPageText(image, { skipCache });
  res.json({ source: result.source, text: result.text, narrationText: result.narrationText || '' });
}));

router.post('/api/page-audio', asyncHandler(async (req, res) => {
  const { image, voice } = req.body || {};
  if (!image) {
    throw createHttpError(400, 'Image is required');
  }
  const requestedVoiceId =
    typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
  const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];
  const result = await handlePageAudio({ image, voiceProfile });
  res.json(result);
}));

router.post('/api/upload/pdf', upload.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw createHttpError(400, 'PDF file is required');
  }
  const { bookId, manifest } = await createBookFromPdf(file.buffer, file.originalname || 'book.pdf');
  res.json({ book: bookId, manifest });
}));

export default router;
