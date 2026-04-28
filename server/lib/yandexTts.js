import { createHttpError } from './errors.js';
import {
  YANDEX_API_KEY,
  YANDEX_FOLDER_ID,
  YANDEX_TTS_LANG,
  YANDEX_TTS_SAMPLE_RATE,
  YANDEX_TTS_SPEED
} from '../config.js';

const YANDEX_TTS_URL = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize';

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function sanitizeVoice(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'alena';
  }
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith('yandex_') ? trimmed.slice(7) : trimmed;
}

function clampInt16(value) {
  if (value > 32767) {
    return 32767;
  }
  if (value < -32768) {
    return -32768;
  }
  return Math.round(value);
}

function resamplePcmS16Le(buffer, sourceSampleRate, targetSampleRate) {
  if (sourceSampleRate === targetSampleRate) {
    return buffer;
  }
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    throw createHttpError(500, 'Invalid Yandex TTS source sample rate');
  }
  if (!Number.isFinite(targetSampleRate) || targetSampleRate <= 0) {
    throw createHttpError(500, 'Invalid stream audio sample rate');
  }
  const inputSamples = Math.floor(buffer.length / 2);
  if (inputSamples <= 1) {
    return buffer;
  }
  const outputSamples = Math.max(1, Math.round((inputSamples * targetSampleRate) / sourceSampleRate));
  const output = Buffer.alloc(outputSamples * 2);
  const ratio = sourceSampleRate / targetSampleRate;

  for (let index = 0; index < outputSamples; index += 1) {
    const sourcePosition = index * ratio;
    const lowerIndex = Math.floor(sourcePosition);
    const upperIndex = Math.min(inputSamples - 1, lowerIndex + 1);
    const weight = sourcePosition - lowerIndex;
    const lowerSample = buffer.readInt16LE(lowerIndex * 2);
    const upperSample = buffer.readInt16LE(upperIndex * 2);
    const sample = lowerSample + (upperSample - lowerSample) * weight;
    output.writeInt16LE(clampInt16(sample), index * 2);
  }

  return output;
}

async function requestYandexTtsBuffer({
  text,
  voice = 'alena',
  format = 'mp3',
  sampleRate,
  signal
}) {
  const spokenText = sanitizeText(text);
  if (!spokenText) {
    throw createHttpError(400, 'Text is required');
  }
  if (!YANDEX_API_KEY) {
    throw createHttpError(500, 'YANDEX_API_KEY is not configured');
  }
  if (!YANDEX_FOLDER_ID) {
    throw createHttpError(500, 'YANDEX_FOLDER_ID is not configured');
  }

  const params = new URLSearchParams({
    text: spokenText,
    lang: YANDEX_TTS_LANG,
    voice: sanitizeVoice(voice),
    speed: YANDEX_TTS_SPEED,
    format,
    folderId: YANDEX_FOLDER_ID
  });
  if (format === 'lpcm' && sampleRate) {
    params.set('sampleRateHertz', String(sampleRate));
  }

  const response = await fetch(YANDEX_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${YANDEX_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params,
    signal
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw createHttpError(502, detail || `Yandex TTS request failed: ${response.status}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.length) {
    throw createHttpError(502, 'Yandex TTS returned empty audio');
  }
  return audioBuffer;
}

export async function generateYandexTtsAudioBuffer({
  text,
  voice = 'alena',
  signal
}) {
  return requestYandexTtsBuffer({
    text,
    voice,
    format: 'mp3',
    signal
  });
}

export async function generateYandexTtsPcmBuffer({
  text,
  voice = 'alena',
  sampleRate = 24000,
  signal
}) {
  const sourceSampleRate =
    Number.isFinite(YANDEX_TTS_SAMPLE_RATE) && YANDEX_TTS_SAMPLE_RATE > 0
      ? YANDEX_TTS_SAMPLE_RATE
      : 48000;
  const audioBuffer = await requestYandexTtsBuffer({
    text,
    voice,
    format: 'lpcm',
    sampleRate: sourceSampleRate,
    signal
  });
  return resamplePcmS16Le(audioBuffer, sourceSampleRate, sampleRate);
}
