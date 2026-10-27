import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { QWEN_TTS_SERVER, QWEN_TTS_TIMEOUT_MS } from '../config.js';
import { AsyncSingleFlight } from './asyncSingleFlight.js';
import { createHttpError } from './errors.js';

export const QWEN_VOICE_PREFIX = 'qwen_';

// Count Unicode characters as the Python API does, and never split a surrogate pair.
export function splitQwenText(text, maxLength = 3000) {
  const chunks = [];
  for (const paragraph of text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
    let characters = Array.from(paragraph);
    while (characters.length > maxLength) {
      const candidate = characters.slice(0, maxLength).join('');
      const sentences = [...candidate.matchAll(/[.!?…]["»”')\]]*\s+/gu)];
      const spaces = [...candidate.matchAll(/\s+/gu)];
      const boundary = sentences.at(-1) ?? spaces.at(-1);
      const end = boundary ? Array.from(candidate.slice(0, boundary.index + boundary[0].length)).length : maxLength;
      chunks.push(characters.slice(0, end).join('').trim());
      characters = characters.slice(end);
    }
    const tail = characters.join('').trim();
    if (tail) chunks.push(tail);
  }
  return chunks.filter(Boolean);
}

async function readQwenError(response) {
  let detail;
  try {
    ({ detail } = await response.json());
  } catch {
    // Proxies may return plain text or HTML instead of FastAPI's JSON.
  }
  const message = typeof detail === 'string'
    ? detail
    : Array.isArray(detail)
      ? detail.map((entry) => `${entry.loc?.join('.') || 'request'}: ${entry.msg || 'Invalid value'}`).join('; ')
      : `Request failed (${response.status})`;
  const hint = response.status === 404 ? ' Refresh the voice list.' : '';
  return createHttpError([404, 409, 422, 502].includes(response.status) ? response.status : 502,
    `Qwen TTS: ${message}${hint}`);
}

export function createQwenTtsClient({
  server = QWEN_TTS_SERVER,
  timeoutMs = QWEN_TTS_TIMEOUT_MS,
  voicesTimeoutMs = 5000,
  retryDelayMs = 1000,
  fetchImpl = (...args) => fetch(...args)
} = {}) {
  const queue = new AsyncSingleFlight();
  const baseUrl = server.replace(/\/+$/, '');

  async function request(endpoint, options, signal) {
    try {
      return await fetchImpl(`${baseUrl}${endpoint}`, { ...options, signal });
    } catch (error) {
      if (signal.aborted) throw error;
      const cause = error.cause?.code || error.cause?.message;
      throw createHttpError(502, `Qwen TTS connection failed: ${error.message}${cause ? ` (${cause})` : ''}`);
    }
  }

  async function getVoices({ signal } = {}) {
    const deadline = AbortSignal.timeout(voicesTimeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      const response = await request('/api/voices', { headers: { Accept: 'application/json' } }, requestSignal);
      if (!response.ok) throw await readQwenError(response);
      const payload = await response.json();
      if (!Array.isArray(payload.voices) || !Number.isInteger(payload.max_text_length) || payload.max_text_length < 1 ||
        !payload.voices.every((voice) => typeof voice?.id === 'string' && voice.id && typeof voice.name === 'string')) {
        throw createHttpError(502, 'Qwen TTS returned an invalid voice list');
      }
      return { voices: payload.voices, maxTextLength: Math.min(3000, payload.max_text_length) };
    } catch (error) {
      if (signal?.aborted) throw error;
      if (deadline.aborted) throw createHttpError(504, 'Qwen TTS voice request timed out');
      if (error.status) throw error;
      throw createHttpError(502, `Qwen TTS voice request failed: ${error.message}`);
    }
  }

  async function generatePcmBuffer({ text, voice, signal }) {
    if (typeof text !== 'string' || !text.trim()) throw createHttpError(422, 'Text is required');
    if (typeof voice !== 'string' || !voice.startsWith(QWEN_VOICE_PREFIX) || !voice.slice(QWEN_VOICE_PREFIX.length)) {
      throw createHttpError(422, 'A Qwen TTS voice is required');
    }
    return queue.run(async () => {
      const catalog = await getVoices({ signal });
      const voiceId = voice.slice(QWEN_VOICE_PREFIX.length);
      if (!catalog.voices.some((entry) => entry.id === voiceId)) {
        throw createHttpError(404, 'Qwen TTS voice not found. Refresh the voice list.');
      }
      const buffers = [];
      for (const chunk of splitQwenText(text, catalog.maxTextLength)) {
        // Each chunk has its own deadline, including retries while another client is generating.
        const deadline = AbortSignal.timeout(timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
        try {
          while (true) {
            requestSignal.throwIfAborted();
            const response = await request('/api/synthesize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
              body: JSON.stringify({ voice: voiceId, text: chunk })
            }, requestSignal);
            if (response.status === 409) {
              await response.arrayBuffer();
              await delay(retryDelayMs, undefined, { signal: requestSignal });
              continue;
            }
            if (!response.ok) {
              const error = await readQwenError(response);
              if (response.status === 404) await getVoices({ signal: requestSignal }).catch(() => {});
              throw error;
            }
            const contentType = response.headers.get('content-type')?.split(';')[0].trim();
            if (contentType !== 'audio/wav' && contentType !== 'audio/x-wav') {
              await response.body?.cancel();
              throw createHttpError(502, 'Qwen TTS returned an unexpected audio format');
            }
            const wav = Buffer.from(await response.arrayBuffer());
            if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
              throw createHttpError(502, 'Qwen TTS returned invalid or empty WAV audio');
            }
            buffers.push(await convertWavToPcm(wav, requestSignal));
            break;
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          if (deadline.aborted) throw createHttpError(504, 'Qwen TTS generation timed out');
          if (error.status) throw error;
          throw createHttpError(502, `Qwen TTS generation failed: ${error.message}`);
        }
      }
      return Buffer.concat(buffers);
    }, signal);
  }

  return { getVoices, generatePcmBuffer };
}

// Qwen WAV sample rates may differ from Reader's playback format. Decode the
// complete container (including optional WAV chunks) and resample to 24 kHz mono.
async function convertWavToPcm(wav, signal) {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-f', 's16le', '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', 'pipe:1'], { signal });
    const buffers = [];
    process.stdout.on('data', (chunk) => buffers.push(chunk));
    process.stderr.resume();
    process.stdin.on('error', () => {}); // Exit/error below reports decoder failures, including EPIPE.
    process.once('error', (error) => reject(signal?.aborted ? error : createHttpError(502, 'Unable to run ffmpeg for Qwen TTS')));
    process.once('close', (code) => {
      const pcm = Buffer.concat(buffers);
      if (code !== 0 || pcm.length === 0) reject(createHttpError(502, 'Failed to decode Qwen TTS WAV audio'));
      else resolve(pcm);
    });
    process.stdin.end(wav);
  });
}

const client = createQwenTtsClient();
export const getQwenTtsVoices = client.getVoices;
export const generateQwenTtsPcmBuffer = client.generatePcmBuffer;
