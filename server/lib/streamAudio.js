import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { PassThrough, Transform } from 'node:stream';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Agent, WebSocket } from 'undici';
import {
  STREAM_PCM_GENERATION_REALTIME_FACTOR,
  STREAM_PCM_INITIAL_BUFFER_SECONDS,
  STREAM_PCM_MAX_INITIAL_BUFFER_SECONDS,
  STREAM_PCM_SPEECH_WORDS_PER_MINUTE,
  STREAM_SERVER,
  STREAM_VOICE
} from '../config.js';
import { assertBookDirectory } from './books.js';
import { getChapterTextVersionText } from './chapterTextVersions.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { prepareChapterSpeechSegments, stripMarkdown } from './streamText.js';
import { splitTextForStreaming } from './streamAudioText.js';

const SAMPLE_RATE = 24_000;
const CHANNEL_COUNT = 1;
const BIT_DEPTH = 16;
const CHAPTER_PAD_LENGTH = 3;
const execFileAsync = promisify(execFile);
export const PCM_STREAM_SAMPLE_RATE = SAMPLE_RATE;
export const PCM_STREAM_CHANNEL_COUNT = CHANNEL_COUNT;
export const PCM_STREAM_BIT_DEPTH = BIT_DEPTH;
export const PCM_STREAM_MIME_TYPE = 'audio/wav';
export const PCM_STREAM_BYTES_PER_SECOND = SAMPLE_RATE * CHANNEL_COUNT * (BIT_DEPTH / 8);
const READER_TEST_HOSTNAME = 'reader.test';
const EMPTY_AUDIO_RETRY_LIMIT = 2;
const EMPTY_AUDIO_RETRY_DELAY_MS = 120;
const WORD_PATTERN = /\S+/g;
const insecureReaderTestDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false
  }
});

function createAbortError() {
  const error = new Error('Streaming audio aborted');
  error.name = 'AbortError';
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStreamLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveStreamDispatcher(wsUrl) {
  return wsUrl.hostname === READER_TEST_HOSTNAME ? insecureReaderTestDispatcher : undefined;
}

function buildStreamServerUrl(text, voice) {
  if (!STREAM_SERVER) {
    throw createHttpError(500, 'Streaming server is not configured');
  }
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
  return wsUrl;
}

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function normalizeAudioVersionId(versionId) {
  return typeof versionId === 'string' && versionId.trim() ? versionId.trim() : 'base';
}

function sanitizeAudioVersionSuffix(versionId) {
  return normalizeAudioVersionId(versionId).replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function normalizeAudioVoice(voice) {
  return typeof voice === 'string' && voice.trim() ? voice.trim() : null;
}

function hashSpeechText(text) {
  return crypto.createHash('sha1').update(typeof text === 'string' ? text : '').digest('hex');
}

export function formatChapterAudioFilename(chapterNumber, versionId = 'base', extension = '.mp3') {
  const baseName = formatChapterFilename(chapterNumber).replace(/\.txt$/i, '');
  const normalizedVersionId = normalizeAudioVersionId(versionId);
  const versionSuffix = normalizedVersionId === 'base' ? '' : `.${sanitizeAudioVersionSuffix(normalizedVersionId)}`;
  return `${baseName}${versionSuffix}${extension}`;
}

async function encodeMp3(wavPath, mp3Path) {
  try {
    await execFileAsync('lame', ['--silent', '-h', wavPath, mp3Path]);
  } catch {
    throw createHttpError(502, 'Failed to encode MP3 audio');
  }
}

async function removeExistingChapterAudioFiles(mp3Path, metaPath) {
  for (const targetPath of [mp3Path, metaPath]) {
    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function readChapterAudioMeta(metaPath) {
  try {
    const rawMeta = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(rawMeta);
  } catch {
    return null;
  }
}

async function getAudioDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const value = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    console.warn('Failed to read audio duration with ffprobe', {
      filePath,
      message: error instanceof Error ? error.message : String(error),
      code: error?.code ?? null,
      signal: error?.signal ?? null,
      stdout: typeof error?.stdout === 'string' ? error.stdout.slice(0, 500) : null,
      stderr: typeof error?.stderr === 'string' ? error.stderr.slice(0, 1000) : null
    });
    return null;
  }
}

export async function getMp3BufferDurationSeconds(buffer, tempDir) {
  const tempPath = path.join(tempDir, `.duration-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    await fs.writeFile(tempPath, buffer);
    const durationSeconds = await getAudioDurationSeconds(tempPath);
    if (durationSeconds === null) {
      console.warn('Unable to determine generated MP3 chunk duration', {
        tempPath,
        bytes: buffer.length
      });
    }
    return durationSeconds;
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('Failed to delete temporary MP3 duration file', error);
      }
    }
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

function buildStreamingWavHeader() {
  const blockAlign = (CHANNEL_COUNT * BIT_DEPTH) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const buffer = Buffer.alloc(44);
  const unknownLength = 0xffffffff;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(unknownLength, 4);
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
  buffer.writeUInt32LE(unknownLength, 40);

  return buffer;
}

export function estimatePcmInitialBufferSeconds(
  text,
  {
    minimumSeconds = STREAM_PCM_INITIAL_BUFFER_SECONDS,
    generationRealtimeFactor = STREAM_PCM_GENERATION_REALTIME_FACTOR,
    speechWordsPerMinute = STREAM_PCM_SPEECH_WORDS_PER_MINUTE,
    maxSeconds = STREAM_PCM_MAX_INITIAL_BUFFER_SECONDS
  } = {}
) {
  const minimum = Number.isFinite(minimumSeconds) && minimumSeconds > 0 ? minimumSeconds : 0;
  if (minimum <= 0) {
    return 0;
  }
  const factor = Number.isFinite(generationRealtimeFactor) && generationRealtimeFactor > 1
    ? generationRealtimeFactor
    : 1;
  const wordsPerMinute = Number.isFinite(speechWordsPerMinute) && speechWordsPerMinute > 0
    ? speechWordsPerMinute
    : 150;
  const maximum = Number.isFinite(maxSeconds) && maxSeconds > 0 ? maxSeconds : 0;
  const wordCount = (String(text || '').trim().match(WORD_PATTERN) || []).length;
  if (wordCount === 0 || factor <= 1) {
    return maximum > 0 ? Math.min(minimum, maximum) : minimum;
  }

  const estimatedAudioSeconds = (wordCount / wordsPerMinute) * 60;
  const catchUpRatio = (factor - 1) / factor;
  const automaticSeconds = estimatedAudioSeconds * catchUpRatio;
  const bufferSeconds = Math.max(minimum, automaticSeconds);
  return maximum > 0 ? Math.min(bufferSeconds, maximum) : bufferSeconds;
}

export function createBufferedPcmStream(
  stream,
  {
    initialBufferSeconds = STREAM_PCM_INITIAL_BUFFER_SECONDS,
    initialBufferBytes = Math.round(initialBufferSeconds * PCM_STREAM_BYTES_PER_SECOND)
  } = {}
) {
  const targetBytes =
    Number.isFinite(initialBufferBytes) && initialBufferBytes > 0 ? Math.floor(initialBufferBytes) : 0;
  if (targetBytes <= 0) {
    return stream;
  }

  const bufferedChunks = [];
  let bufferedBytes = 0;
  let flushed = false;

  const flushBufferedChunks = (transform) => {
    if (flushed) {
      return;
    }
    flushed = true;
    for (const chunk of bufferedChunks) {
      transform.push(chunk);
    }
    bufferedChunks.length = 0;
  };

  const bufferTransform = new Transform({
    transform(chunk, _encoding, callback) {
      if (flushed) {
        callback(null, chunk);
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bufferedChunks.push(buffer);
      bufferedBytes += buffer.length;
      if (bufferedBytes >= targetBytes) {
        flushBufferedChunks(this);
      }
      callback();
    },
    flush(callback) {
      flushBufferedChunks(this);
      callback();
    }
  });

  return stream.pipe(bufferTransform);
}

async function readStreamToBuffer(stream, signal) {
  const chunks = [];
  for await (const chunk of stream) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function streamTextToPcm(text, voice) {
  const wsUrl = buildStreamServerUrl(text, voice);
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let closed = false;
    let finished = false;
    const socket = new WebSocket(wsUrl, {
      dispatcher: resolveStreamDispatcher(wsUrl)
    });
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
        return;
      }
      try {
        chunks.push(Buffer.from(event.data));
      } catch {
        // ignore unknown payloads
      }
    });

    socket.addEventListener('error', (event) => {
      finalize(createHttpError(502, 'Streaming audio connection failed'));
    });

    socket.addEventListener('close', () => {
      closed = true;
      finalize();
    });
  });
}

async function streamSingleTextSegmentToWritableOnce(text, voice, writable, signal, context = {}) {
  const wsUrl = buildStreamServerUrl(text, voice);
  return await new Promise((resolve, reject) => {
    let closed = false;
    let finished = false;
    let aborted = false;
    let bytesWritten = 0;
    const socket = new WebSocket(wsUrl, {
      dispatcher: resolveStreamDispatcher(wsUrl)
    });
    socket.binaryType = 'arraybuffer';

    const handleAbort = () => {
      aborted = true;
      finalize(createAbortError());
    };
    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    const finalize = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      if (signal) {
        signal.removeEventListener('abort', handleAbort);
      }
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
      resolve(bytesWritten);
    };

    socket.addEventListener('message', async (event) => {
      if (aborted) {
        return;
      }
      try {
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
              const buffer = Buffer.from(audioValue, 'base64');
              bytesWritten += buffer.length;
              writable.write(buffer);
            } else if (Array.isArray(payload?.data?.audio)) {
              const buffer = Buffer.from(payload.data.audio);
              bytesWritten += buffer.length;
              writable.write(buffer);
            }
          } catch {
            // ignore malformed payloads
          }
          return;
        }
        if (event.data instanceof Blob) {
          const buffer = Buffer.from(await event.data.arrayBuffer());
          bytesWritten += buffer.length;
          writable.write(buffer);
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          const buffer = Buffer.from(event.data);
          bytesWritten += buffer.length;
          writable.write(buffer);
          return;
        }
        if (ArrayBuffer.isView(event.data)) {
          const buffer = Buffer.from(event.data.buffer);
          bytesWritten += buffer.length;
          writable.write(buffer);
          return;
        }
        const buffer = Buffer.from(event.data);
        bytesWritten += buffer.length;
        writable.write(buffer);
      } catch (error) {
        finalize(error);
      }
    });

    socket.addEventListener('error', (event) => {
      finalize(createHttpError(502, 'Streaming audio connection failed'));
    });

    socket.addEventListener('close', () => {
      closed = true;
      if (!aborted && bytesWritten === 0) {
        finalize(createHttpError(502, 'Streaming service returned no audio'));
        return;
      }
      finalize();
    });
  });
}

async function streamSingleTextSegmentToWritable(text, voice, writable, signal, context = {}) {
  let lastError;
  for (let attempt = 1; attempt <= EMPTY_AUDIO_RETRY_LIMIT; attempt += 1) {
    try {
      return await streamSingleTextSegmentToWritableOnce(text, voice, writable, signal, {
        ...context,
        attempt
      });
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.name === 'AbortError') {
        throw error;
      }
      if (error?.message !== 'Streaming service returned no audio' || attempt >= EMPTY_AUDIO_RETRY_LIMIT) {
        throw error;
      }
      await sleep(EMPTY_AUDIO_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

export function createTextPcmStream(text, voice, signal, requestId = createStreamLogId()) {
  const cleaned = stripMarkdown(typeof text === 'string' ? text : '').trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  const output = new PassThrough();
  const chunks = splitTextForStreaming(cleaned);
  let totalBytesWritten = 0;

  void (async () => {
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        if (signal?.aborted) {
          throw createAbortError();
        }
        totalBytesWritten += await streamSingleTextSegmentToWritable(chunk, voice, output, signal, {
          requestId,
          chunkIndex: index + 1
        });
      }
      output.end();
    } catch (error) {
      if ((error && error.name === 'AbortError') || signal?.aborted) {
        output.end();
        return;
      }
      output.destroy(error);
    }
  })();

  return output;
}

export function createTextWavStream(text, voice, signal, requestId = createStreamLogId()) {
  const pcmStream = createTextPcmStream(text, voice, signal, requestId);
  const output = new PassThrough();
  output.write(buildStreamingWavHeader());

  void (async () => {
    try {
      await pipeline(pcmStream, output, { signal });
    } catch (error) {
      if ((error && error.name === 'AbortError') || signal?.aborted) {
        output.end();
        return;
      }
      output.destroy(error);
    }
  })();

  return output;
}

export async function prepareChapterAudio({
  bookId,
  chapterNumber,
  versionId = null,
  provider = 'default',
  voice = null,
  force = false
}) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const textVersion = await getChapterTextVersionText({ bookId, chapterNumber, versionId });
  const chapterFilename = formatChapterFilename(chapterNumber);
  const audioFilename = formatChapterAudioFilename(chapterNumber, textVersion.versionId, '.wav');
  const audioPath = path.join(directory, audioFilename);
  const pcmFilename = audioFilename.replace(/\.wav$/i, '.pcm');
  const pcmPath = path.join(directory, pcmFilename);
  const mp3Filename = audioFilename.replace(/\.wav$/i, '.mp3');
  const mp3Path = path.join(directory, mp3Filename);
  const metaPath = `${mp3Path}.meta.json`;
  const speechSegments = prepareChapterSpeechSegments(textVersion.text);
  const speechSections = speechSegments.map((section) => section.text);
  const cleaned = speechSections.join('\n\n').trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for audio generation');
  }
  const normalizedVoice = normalizeAudioVoice(voice);
  const textHash = hashSpeechText(cleaned);
  const existingMp3 = await safeStat(mp3Path);
  if (existingMp3?.isFile()) {
    const meta = await readChapterAudioMeta(metaPath);
    if (
      !force &&
      (meta?.versionId ?? 'base') === textVersion.versionId &&
      (meta?.provider ?? 'default') === provider &&
      (meta?.voice ?? null) === normalizedVoice &&
      meta?.textHash === textHash
    ) {
      return {
        existingAudioUrl: `/data/${bookId}/${mp3Filename}`,
        cleanText: cleaned,
        textHash,
        versionId: textVersion.versionId
      };
    }
    await removeExistingChapterAudioFiles(mp3Path, metaPath);
  }

  return {
    audioPath,
    cleanText: cleaned,
    metaPath,
    pcmPath,
    mp3Path,
    mp3Url: `/data/${bookId}/${mp3Filename}`,
    speechSegments,
    speechSections,
    textHash,
    textChunks: speechSegments.flatMap((section, sectionIndex) =>
      splitTextForStreaming(section.text).map((text) => ({
        text,
        sectionIndex,
        title: section.title
      }))
    ),
    versionId: textVersion.versionId
  };
}

export async function streamChapterAudioChunk(text, voice) {
  return streamTextToPcm(text, voice);
}

export async function writeChapterAudioMeta({
  metaPath,
  versionId,
  provider = 'default',
  voice = null,
  textHash = null,
  subchapters = []
}) {
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        versionId: versionId ?? 'base',
        provider,
        voice: normalizeAudioVoice(voice),
        textHash: typeof textHash === 'string' && textHash.trim() ? textHash.trim() : null,
        generatedAt: new Date().toISOString(),
        subchapters
      },
      null,
      2
    ),
    'utf8'
  );
}

export async function finalizeDirectChapterAudio({
  mp3Path,
  mp3Buffer,
  metaPath,
  versionId,
  provider = 'default',
  voice = null,
  textHash = null,
  subchapters = []
}) {
  await fs.writeFile(mp3Path, mp3Buffer);
  await writeChapterAudioMeta({ metaPath, versionId, provider, voice, textHash, subchapters });
}

export async function finalizeChapterAudio({
  audioPath,
  mp3Path,
  pcmPath,
  pcmLength,
  metaPath,
  versionId,
  provider = 'default',
  voice = null,
  textHash = null,
  subchapters = []
}) {
  const header = buildWavHeader(pcmLength);
  const wavStream = createWriteStream(audioPath);
  wavStream.write(header);
  await pipeline(createReadStream(pcmPath), wavStream);
  await encodeMp3(audioPath, mp3Path);
  await writeChapterAudioMeta({ metaPath, versionId, provider, voice, textHash, subchapters });
  await fs.unlink(audioPath);
  await fs.unlink(pcmPath);
}
