import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const TTS_LOG_PATH = path.join(DATA_DIR, 'tts-requests.jsonl');
let writeQueue = Promise.resolve();

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

function countCharacters(value) {
  return Array.from(value).length;
}

function createLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDurationMs(startedAtNs) {
  return Math.round((Number(process.hrtime.bigint() - startedAtNs) / 1_000_000) * 10) / 10;
}

export function formatTtsLogError(error) {
  if (!error) {
    return null;
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    status: Number.isInteger(error?.status) ? error.status : null,
    code: typeof error?.code === 'string' ? error.code : null,
    name: typeof error?.name === 'string' ? error.name : null
  };
}

async function appendTtsLog(entry) {
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(TTS_LOG_PATH, line, 'utf8');
  });

  try {
    await writeQueue;
  } catch (error) {
    writeQueue = Promise.resolve();
    console.warn('Failed to write TTS log', error);
  }
}

export function createTtsLogTimer(metadata = {}) {
  const id = metadata.requestId || createLogId();
  const startedAt = new Date();
  const startedAtNs = process.hrtime.bigint();

  return {
    id,
    async finish(result = {}) {
      const completedAt = new Date();
      const text = normalizeText(result.text ?? metadata.text);
      const durationMs =
        typeof result.durationMs === 'number' ? result.durationMs : formatDurationMs(startedAtNs);
      const textHash = text
        ? crypto.createHash('sha1').update(text).digest('hex').slice(0, 16)
        : null;
      const entry = {
        id,
        scope: result.scope ?? metadata.scope ?? 'api',
        endpoint: result.endpoint ?? metadata.endpoint ?? null,
        method: result.method ?? metadata.method ?? null,
        provider: result.provider ?? metadata.provider ?? null,
        model: result.model ?? metadata.model ?? null,
        voice: result.voice ?? metadata.voice ?? null,
        format: result.format ?? metadata.format ?? null,
        status: result.status ?? 'ok',
        source: result.source ?? null,
        cacheHit: typeof result.cacheHit === 'boolean' ? result.cacheHit : null,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
        charCount: countCharacters(text),
        textBytes: Buffer.byteLength(text, 'utf8'),
        textHash,
        responseBytes: Number.isFinite(result.responseBytes) ? result.responseBytes : null,
        audioUrl: result.audioUrl ?? null,
        image: result.image ?? metadata.image ?? null,
        bookId: result.bookId ?? metadata.bookId ?? null,
        chapterNumber: result.chapterNumber ?? metadata.chapterNumber ?? null,
        versionId: result.versionId ?? metadata.versionId ?? null,
        chunkIndex: result.chunkIndex ?? metadata.chunkIndex ?? null,
        chunkCount: result.chunkCount ?? metadata.chunkCount ?? null,
        error: result.error ? formatTtsLogError(result.error) : null,
        text
      };

      await appendTtsLog(entry);
      console.info(
        [
          '[tts]',
          entry.scope,
          entry.endpoint || entry.provider || 'unknown',
          entry.status,
          `${entry.charCount} chars`,
          entry.voice ? `voice=${entry.voice}` : null,
          `${entry.durationMs}ms`
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
  };
}
