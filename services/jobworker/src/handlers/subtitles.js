import fs from 'node:fs/promises';
import path from 'node:path';
import {
  errorMessage,
  normalizeRelativePath,
  nowIso,
  resolveDataPath,
  serializeError,
  statFile,
  writeJsonFile
} from '../lib.js';

const SYNC_SUBTITLES_URL = process.env.JOBWORKER_SYNC_SUBTITLES_URL || 'http://sync-subtitles:3100/generate';
const SUBTITLE_TIMEOUT_MS = Number.parseInt(process.env.JOBWORKER_SUBTITLE_TIMEOUT_MS || '1800000', 10);

function normalizeSubtitlePayload(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const audio = normalizeRelativePath(payload.audio, 'audio');
  const text = normalizeRelativePath(payload.text, 'text');
  const out = normalizeRelativePath(payload.out, 'out');
  const status = normalizeRelativePath(payload.status || `${out}.status.json`, 'status');
  return {
    audio,
    text,
    out,
    status,
    bookId: typeof payload.bookId === 'string' ? payload.bookId : null,
    chapterNumber: Number.isInteger(payload.chapterNumber) ? payload.chapterNumber : null,
    versionId: typeof payload.versionId === 'string' && payload.versionId.trim() ? payload.versionId.trim() : 'base',
    language: typeof payload.language === 'string' && payload.language.trim() ? payload.language.trim() : 'english_us_arpa',
    skipValidate: payload.skipValidate !== false,
    sentenceMode: payload.sentenceMode === 'balanced' ? 'balanced' : 'strict',
    maxLineChars: Number.isFinite(payload.maxLineChars) && payload.maxLineChars > 0 ? payload.maxLineChars : 95,
    beam: Number.isFinite(payload.beam) && payload.beam > 0 ? payload.beam : 100,
    retryBeam: Number.isFinite(payload.retryBeam) && payload.retryBeam > 0 ? payload.retryBeam : 400
  };
}

async function writeSubtitleStatus(payload, status) {
  await writeJsonFile(resolveDataPath(payload.status), {
    status: status.status,
    bookId: payload.bookId,
    chapterNumber: payload.chapterNumber,
    versionId: payload.versionId,
    mp3Path: resolveDataPath(payload.audio),
    transcriptPath: resolveDataPath(payload.text),
    srtPath: resolveDataPath(payload.out),
    subtitleLanguage: payload.language,
    jobId: status.jobId ?? null,
    queuedAt: status.queuedAt ?? null,
    startedAt: status.startedAt ?? null,
    completedAt: status.completedAt ?? null,
    error: status.error ?? null,
    errorDetails: status.errorDetails ?? null,
    responseBytes: status.responseBytes ?? null,
    workerUpdatedAt: nowIso(),
    updatedAt: nowIso()
  });
}

async function requestSubtitles(payload) {
  const controller = new AbortController();
  const timeout = Number.isFinite(SUBTITLE_TIMEOUT_MS) && SUBTITLE_TIMEOUT_MS > 0
    ? setTimeout(() => controller.abort(), SUBTITLE_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(SYNC_SUBTITLES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audio: payload.audio,
        text: payload.text,
        out: path.basename(payload.out),
        language: payload.language,
        skipValidate: payload.skipValidate,
        sentenceMode: payload.sentenceMode,
        maxLineChars: payload.maxLineChars,
        beam: payload.beam,
        retryBeam: payload.retryBeam
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        throw new Error(parsed?.error || parsed?.message || `sync-subtitles failed with HTTP ${response.status}`);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(text.trim() || `sync-subtitles failed with HTTP ${response.status}`);
        }
        throw error;
      }
    }
    return await response.text();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export const subtitlesHandler = {
  type: 'chapter_subtitles',
  aliases: ['subtitles'],

  async normalize(payload) {
    return normalizeSubtitlePayload(payload);
  },

  findDuplicate(jobs, payload) {
    return jobs.find(
      (job) =>
        job.type === this.type &&
        job.payload?.out === payload.out &&
        (job.status === 'queued' || job.status === 'running')
    );
  },

  async createCompletedJob(payload) {
    const existingSrt = await statFile(resolveDataPath(payload.out));
    if (!existingSrt?.isFile()) {
      return null;
    }
    return {
      result: {
        srtPath: resolveDataPath(payload.out),
        responseBytes: existingSrt.size
      }
    };
  },

  async onQueued(job) {
    await writeSubtitleStatus(job.payload, {
      status: 'queued',
      jobId: job.id,
      queuedAt: job.createdAt
    });
  },

  async onStarted(job) {
    await writeSubtitleStatus(job.payload, {
      status: 'running',
      jobId: job.id,
      queuedAt: job.createdAt,
      startedAt: job.startedAt
    });
  },

  async run(job, context = {}) {
    await context.log?.('Requesting subtitle sync service', {
      serviceUrl: SYNC_SUBTITLES_URL,
      audio: job.payload.audio,
      text: job.payload.text,
      out: job.payload.out,
      language: job.payload.language,
      beam: job.payload.beam,
      retryBeam: job.payload.retryBeam
    });
    const srtText = await requestSubtitles(job.payload);
    if (!srtText.trim()) {
      throw new Error('Subtitle service returned an empty SRT file');
    }
    const outPath = resolveDataPath(job.payload.out);
    await context.log?.('Writing subtitle file', {
      outPath,
      bytes: Buffer.byteLength(srtText, 'utf8')
    });
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, srtText, 'utf8');
    return {
      srtPath: outPath,
      responseBytes: Buffer.byteLength(srtText, 'utf8')
    };
  },

  async onCompleted(job, result) {
    await writeSubtitleStatus(job.payload, {
      status: 'completed',
      jobId: job.id,
      queuedAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      responseBytes: result?.responseBytes ?? null
    });
  },

  async onFailed(job, error) {
    await writeSubtitleStatus(job.payload, {
      status: 'failed',
      jobId: job.id,
      queuedAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: errorMessage(error),
      errorDetails: serializeError(error)
    });
  }
};
