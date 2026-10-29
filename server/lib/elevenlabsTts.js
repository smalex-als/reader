import { Readable } from 'node:stream';
import {
  ELEVENLABS_API_KEY,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_TTS_TIMEOUT_MS
} from '../config.js';
import { createHttpError } from './errors.js';

export const ELEVENLABS_VOICE_PREFIX = 'elevenlabs_';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export function splitElevenLabsText(text) {
  const chunks = [];
  let characters = Array.from(text.trim());
  while (characters.length > 2000) {
    const candidate = characters.slice(0, 2000).join('');
    const boundary = [...candidate.matchAll(/[.!?…]["»”')\]]*\s+/gu)].at(-1)
      ?? [...candidate.matchAll(/\s+/gu)].at(-1);
    const end = boundary ? Array.from(candidate.slice(0, boundary.index + boundary[0].length)).length : 2000;
    chunks.push(characters.slice(0, end).join('').trim());
    characters = characters.slice(end);
  }
  const tail = characters.join('').trim();
  if (tail) chunks.push(tail);
  return chunks.filter(Boolean);
}

async function readApiError(response) {
  let detail;
  try {
    const payload = await response.json();
    detail = typeof payload.detail === 'string' ? payload.detail : payload.detail?.message;
  } catch {
    // Gateways may return HTML instead of the ElevenLabs JSON error format.
  }
  return createHttpError(response.status === 429 ? 429 : 502,
    `ElevenLabs TTS: ${detail || `Request failed (${response.status})`}`);
}

export function createElevenLabsTtsClient({
  apiKey = ELEVENLABS_API_KEY,
  modelId = ELEVENLABS_MODEL_ID,
  timeoutMs = ELEVENLABS_TTS_TIMEOUT_MS,
  fetchImpl = (...args) => fetch(...args)
} = {}) {
  async function* streamPcm({ text, voice, signal }) {
    if (!apiKey) throw createHttpError(503, 'ELEVENLABS_API_KEY is not configured');
    if (typeof text !== 'string' || !text.trim()) {
      throw createHttpError(400, 'No text available for audio generation');
    }
    const voiceId = typeof voice === 'string' && voice.startsWith(ELEVENLABS_VOICE_PREFIX)
      ? voice.slice(ELEVENLABS_VOICE_PREFIX.length) : '';
    if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
      throw createHttpError(400, 'An ElevenLabs TTS voice is required');
    }

    // Keep requests below model text limits and bound each request's lifetime.
    for (const textChunk of splitElevenLabsText(text)) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const controller = new AbortController();
      const requestSignal = AbortSignal.any([controller.signal, deadline, ...(signal ? [signal] : [])]);
      try {
        requestSignal.throwIfAborted();
        // Eleven v4 is served by Text to Dialogue, including single-voice narration.
        const useDialogue = modelId === 'eleven_v4';
        const endpoint = useDialogue ? '/text-to-dialogue/stream'
          : `/text-to-speech/${encodeURIComponent(voiceId)}/stream`;
        const payload = useDialogue
          ? { inputs: [{ text: textChunk, voice_id: voiceId }], model_id: modelId }
          : { text: textChunk, model_id: modelId };
        const response = await fetchImpl(`${ELEVENLABS_API_URL}${endpoint}?output_format=pcm_24000`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/octet-stream' },
          body: JSON.stringify(payload),
          signal: requestSignal
        });
        if (!response.ok) throw await readApiError(response);
        const contentType = response.headers.get('content-type')?.split(';')[0].trim();
        if (!response.body || !['application/octet-stream', 'audio/pcm', 'audio/x-pcm'].includes(contentType)) {
          await response.body?.cancel();
          throw createHttpError(502, 'ElevenLabs TTS returned an unexpected audio format');
        }
        let byteLength = 0;
        let remainder = Buffer.alloc(0);
        for await (const chunk of response.body) {
          requestSignal.throwIfAborted();
          const pcm = Buffer.concat([remainder, Buffer.from(chunk)]);
          const end = pcm.length - (pcm.length % 2);
          remainder = pcm.subarray(end);
          if (end > 0) {
            byteLength += end;
            yield pcm.subarray(0, end);
          }
        }
        if (byteLength === 0 || remainder.length) {
          throw createHttpError(502, 'ElevenLabs TTS returned invalid or empty PCM audio');
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        if (deadline.aborted) throw createHttpError(504, 'ElevenLabs TTS generation timed out');
        if (error.status) throw error;
        throw createHttpError(502, `ElevenLabs TTS generation failed: ${error.message}`);
      } finally {
        controller.abort();
      }
    }
  }

  const createPcmStream = (options) => Readable.from(streamPcm(options), { objectMode: false });
  async function generatePcmBuffer(options) {
    const buffers = [];
    for await (const chunk of streamPcm(options)) buffers.push(chunk);
    return Buffer.concat(buffers);
  }
  return { createPcmStream, generatePcmBuffer };
}

const client = createElevenLabsTtsClient();
export const createElevenLabsTtsPcmStream = client.createPcmStream;
export const generateElevenLabsTtsPcmBuffer = client.generatePcmBuffer;
