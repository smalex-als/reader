import fs from 'node:fs/promises';
import path from 'node:path';
import { createHttpError } from './errors.js';
import { DATA_DIR, XAI_API_KEY } from '../config.js';

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';
const DEBUG_DIR = path.join(DATA_DIR, '_debug');

function sanitizeVoice(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Eve';
  }
  return value.trim();
}

function sanitizeLanguage(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'en';
  }
  return value.trim();
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildPayload({ text, voice = 'Eve', language = 'en', outputFormat }) {
  return {
    text: sanitizeText(text),
    voice_id: sanitizeVoice(voice),
    language: sanitizeLanguage(language),
    output_format: {
      codec: 'mp3',
      sample_rate: 44100,
      bit_rate: 128000,
      ...(outputFormat && typeof outputFormat === 'object' ? outputFormat : {})
    }
  };
}

function makeDebugFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `xai-tts-${timestamp}-${process.pid}.mp3`;
}

export async function generateXaiTtsDebugFile({
  text,
  voice = 'Eve',
  language = 'en',
  outputFormat
}) {
  const payload = buildPayload({ text, voice, language, outputFormat });
  if (!payload.text) {
    throw createHttpError(400, 'Text is required');
  }
  const audioBuffer = await generateXaiTtsAudioBuffer({ text, voice, language, outputFormat });

  await fs.mkdir(DEBUG_DIR, { recursive: true });
  const filename = makeDebugFilename();
  const filePath = path.join(DEBUG_DIR, filename);
  await fs.writeFile(filePath, audioBuffer);

  return {
    filename,
    bytes: audioBuffer.length,
    filePath,
    url: `/data/_debug/${filename}`,
    voice: payload.voice_id,
    language: payload.language
  };
}

export async function generateXaiTtsAudioBuffer({
  text,
  voice = 'Eve',
  language = 'en',
  outputFormat
}) {
  const payload = buildPayload({ text, voice, language, outputFormat });
  if (!payload.text) {
    throw createHttpError(400, 'Text is required');
  }
  if (!XAI_API_KEY) {
    throw createHttpError(500, 'XAI_API_KEY is not configured');
  }

  const response = await fetch(XAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw createHttpError(502, detail || `xAI TTS request failed: ${response.status}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.length) {
    throw createHttpError(502, 'xAI TTS returned empty audio');
  }
  return audioBuffer;
}
