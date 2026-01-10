import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket } from 'undici';
import { STREAM_SERVER, STREAM_VOICE } from '../config.js';
import { assertBookDirectory } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { stripMarkdown } from './streamText.js';

const SAMPLE_RATE = 24_000;
const CHANNEL_COUNT = 1;
const BIT_DEPTH = 16;
const CHAPTER_PAD_LENGTH = 3;
const STREAM_TEXT_LIMIT = 2000;
const execFileAsync = promisify(execFile);

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatNarrationFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.narration.txt`;
}

async function encodeMp3(wavPath, mp3Path) {
  try {
    await execFileAsync('lame', ['--silent', '-h', wavPath, mp3Path]);
  } catch {
    throw createHttpError(502, 'Failed to encode MP3 audio');
  }
}

function buildWavHeader(dataLength) {
  const blockAlign = (CHANNEL_COUNT * BIT_DEPTH) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

async function streamTextToPcm(text, voice) {
  if (!STREAM_SERVER) {
    throw createHttpError(500, 'Streaming server is not configured');
  }
  console.log('[stream-audio] stream-server', STREAM_SERVER);
  const params = new URLSearchParams();
  params.set('text', text);
  const selectedVoice = typeof voice === 'string' && voice.trim() ? voice.trim() : STREAM_VOICE;
  if (selectedVoice) {
    params.set('voice', selectedVoice);
  }
  params.set('cfg', '1.5');
  params.set('steps', '5');

  const wsUrl = new URL('/stream', STREAM_SERVER);
  if (wsUrl.protocol === 'https:') {
    wsUrl.protocol = 'wss:';
  } else if (wsUrl.protocol === 'http:') {
    wsUrl.protocol = 'ws:';
  } else if (wsUrl.protocol !== 'ws:' && wsUrl.protocol !== 'wss:') {
    wsUrl.protocol = 'ws:';
  }
  wsUrl.search = params.toString();
  console.log('[stream-audio] websocket-url', wsUrl.toString());
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let closed = false;
    let finished = false;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';

    const finalize = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      if (!closed) {
        try {
          socket.close();
        } catch {
          // ignore close errors
        }
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks));
    };

    socket.addEventListener('message', async (event) => {
      if (typeof event.data === 'string') {
        try {
          const payload = JSON.parse(event.data);

          const audioCandidates = [
            payload?.audio,
            payload?.data?.audio,
            payload?.data?.audio_b64,
            payload?.data?.pcm,
            payload?.data?.pcm_b64,
            payload?.data?.chunk,
            payload?.data?.chunk_b64,
            payload?.data?.payload
          ];
          const audioValue = audioCandidates.find((value) => typeof value === 'string' && value.length > 0);
          if (audioValue) {
            const decoded = Buffer.from(audioValue, 'base64');
            chunks.push(decoded);
          } else if (Array.isArray(payload?.data?.audio)) {
            const decoded = Buffer.from(payload.data.audio);
            chunks.push(decoded);
          }
        } catch {
          // ignore malformed payloads
        }
        return;
      }
      if (event.data instanceof Blob) {
        try {
          const buffer = await event.data.arrayBuffer();
          chunks.push(Buffer.from(buffer));
        } catch {
          // ignore malformed payloads
        }
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        chunks.push(Buffer.from(event.data));
        return;
      }
      if (ArrayBuffer.isView(event.data)) {
        chunks.push(Buffer.from(event.data.buffer));
        console.log('[stream-audio] message-arraybufferview', { bytes: event.data.byteLength });
        return;
      }
      try {
        chunks.push(Buffer.from(event.data));
        console.log('[stream-audio] message-buffer', { bytes: event.data.length });
      } catch {
        // ignore unknown payloads
      }
    });

    socket.addEventListener('error', (event) => {
      console.log('[stream-audio] websocket-error', event);
      finalize(createHttpError(502, 'Streaming audio connection failed'));
    });

    socket.addEventListener('close', () => {
      console.log('[stream-audio] websocket-close');
      closed = true;
      finalize();
    });
  });
}

function splitTextForStreaming(input) {
  const text = input.trim();
  if (text.length <= STREAM_TEXT_LIMIT) {
    return [text];
  }
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
  const chunks = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= STREAM_TEXT_LIMIT) {
      buffer = candidate;
      continue;
    }
    if (buffer) {
      chunks.push(buffer);
      buffer = '';
    }
    if (paragraph.length <= STREAM_TEXT_LIMIT) {
      buffer = paragraph;
      continue;
    }
    let cursor = 0;
    while (cursor < paragraph.length) {
      chunks.push(paragraph.slice(cursor, cursor + STREAM_TEXT_LIMIT));
      cursor += STREAM_TEXT_LIMIT;
    }
  }
  if (buffer) {
    chunks.push(buffer);
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

export async function generateChapterAudio({ bookId, chapterNumber, voice }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const chapterFilename = formatChapterFilename(chapterNumber);
  const narrationFilename = formatNarrationFilename(chapterNumber);
  const narrationPath = path.join(directory, narrationFilename);
  const narrationStat = await safeStat(narrationPath);
  if (!narrationStat?.isFile()) {
    throw createHttpError(404, 'Narration file not found');
  }
  const audioFilename = chapterFilename.replace(/\.txt$/i, '.wav');
  const audioPath = path.join(directory, audioFilename);
  const mp3Filename = audioFilename.replace(/\.wav$/i, '.mp3');
  const mp3Path = path.join(directory, mp3Filename);
  const existingMp3 = await safeStat(mp3Path);
  if (existingMp3?.isFile()) {
    return {
      source: 'file',
      url: `/data/${bookId}/${mp3Filename}`
    };
  }

  const rawText = await fs.readFile(narrationPath, 'utf8');
  const cleaned = stripMarkdown(rawText).trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  const textChunks = splitTextForStreaming(cleaned);
  const pcmParts = [];
  for (const chunk of textChunks) {
    const pcmBuffer = await streamTextToPcm(chunk, voice);
    if (!pcmBuffer.length) {
      throw createHttpError(502, 'No audio returned from streaming service');
    }
    pcmParts.push(pcmBuffer);
  }
  const pcmBuffer = Buffer.concat(pcmParts);

  const header = buildWavHeader(pcmBuffer.length);
  const wavBuffer = Buffer.concat([header, pcmBuffer]);
  await fs.writeFile(audioPath, wavBuffer);
  await encodeMp3(audioPath, mp3Path);
  await fs.unlink(audioPath);

  return {
    source: 'stream',
    url: `/data/${bookId}/${mp3Filename}`
  };
}
