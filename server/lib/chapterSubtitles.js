import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CHAPTER_SUBTITLES_BEAM,
  CHAPTER_SUBTITLES_LANGUAGE,
  CHAPTER_SUBTITLES_MAX_LINE_CHARS,
  CHAPTER_SUBTITLES_RETRY_BEAM,
  CHAPTER_SUBTITLES_SENTENCE_MODE,
  CHAPTER_SUBTITLES_SKIP_VALIDATE,
  CHAPTER_JOBWORKER_URL,
  DATA_DIR
} from '../config.js';
import { formatChapterAudioFilename } from './streamAudio.js';

const OUTPUT_LIMIT = 12_000;
const SUBTITLE_SERVICE_CONNECT_RETRIES = 5;
const SUBTITLE_SERVICE_CONNECT_RETRY_DELAY_MS = 2_000;
const TRANSIENT_FETCH_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
]);

function truncateOutput(value) {
  const text = String(value || '');
  return text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeError(error) {
  if (!(error instanceof Error)) {
    return {
      message: String(error)
    };
  }
  const cause = error.cause;
  return {
    message: error.message,
    name: error.name,
    code: error.code ?? cause?.code ?? null,
    errno: error.errno ?? cause?.errno ?? null,
    syscall: error.syscall ?? cause?.syscall ?? null,
    address: error.address ?? cause?.address ?? null,
    port: error.port ?? cause?.port ?? null,
    causeMessage: cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : null
  };
}

function isTransientFetchError(error) {
  const details = serializeError(error);
  return TRANSIENT_FETCH_ERROR_CODES.has(details.code);
}

function formatErrorMessage(error) {
  const details = serializeError(error);
  const parts = [details.message];
  if (details.code) {
    parts.push(details.code);
  }
  if (details.syscall) {
    parts.push(details.syscall);
  }
  if (details.address || details.port) {
    parts.push(`${details.address ?? ''}${details.port ? `:${details.port}` : ''}`);
  }
  if (details.causeMessage && details.causeMessage !== details.message) {
    parts.push(details.causeMessage);
  }
  return parts.filter(Boolean).join(' - ');
}

export function resolveChapterSubtitleLanguage(transcriptText) {
  const configured = CHAPTER_SUBTITLES_LANGUAGE.trim();
  if (configured && configured !== 'auto') {
    return configured;
  }
  return /[\u0400-\u04FF]/u.test(transcriptText) ? 'russian_mfa' : 'english_us_arpa';
}

function resolveMaxLineChars() {
  return Number.isFinite(CHAPTER_SUBTITLES_MAX_LINE_CHARS) && CHAPTER_SUBTITLES_MAX_LINE_CHARS > 0
    ? CHAPTER_SUBTITLES_MAX_LINE_CHARS
    : 95;
}

function resolveBeam() {
  return Number.isFinite(CHAPTER_SUBTITLES_BEAM) && CHAPTER_SUBTITLES_BEAM > 0
    ? CHAPTER_SUBTITLES_BEAM
    : 100;
}

function resolveRetryBeam() {
  return Number.isFinite(CHAPTER_SUBTITLES_RETRY_BEAM) && CHAPTER_SUBTITLES_RETRY_BEAM > 0
    ? CHAPTER_SUBTITLES_RETRY_BEAM
    : 400;
}

function toDataRelativePath(filePath) {
  const relativePath = path.relative(DATA_DIR, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Subtitle path is outside data directory: ${filePath}`);
  }
  return relativePath.split(path.sep).join('/');
}

function resolveDataRelativePath(relativePath, fieldName) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  const normalized = relativePath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(DATA_DIR, normalized);
  if (!resolved.startsWith(`${DATA_DIR}${path.sep}`) && resolved !== DATA_DIR) {
    throw new Error(`${fieldName} must stay under data directory`);
  }
  return resolved;
}

function parseChapterSubtitleTarget(relativeSrtPath) {
  const normalized = relativeSrtPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const filename = parts.at(-1) || '';
  const basename = filename.replace(/\.srt$/i, '');
  const match = /^chapter(\d+)(?:\.(.+))?$/i.exec(basename);
  return {
    bookId: parts.length > 1 ? parts.slice(0, -1).join('/') : null,
    chapterNumber: match ? Number.parseInt(match[1], 10) : null,
    versionId: match?.[2] || 'base'
  };
}

function resolveJobWorkerUrl() {
  const configured = CHAPTER_JOBWORKER_URL.trim();
  if (!configured) {
    return '';
  }
  const url = new URL(configured);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/jobs/subtitles';
  }
  return url.toString();
}

async function writeSubtitleStatus(statusPath, status) {
  await fs.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.writeFile(
    statusPath,
    JSON.stringify(
      {
        ...status,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  );
}

async function readSubtitleServiceResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: truncateOutput(text) };
  }
}

async function fetchSubtitleServiceWithRetries(serviceUrl, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= SUBTITLE_SERVICE_CONNECT_RETRIES; attempt += 1) {
    try {
      return await fetch(serviceUrl, options);
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt >= SUBTITLE_SERVICE_CONNECT_RETRIES) {
        throw error;
      }
      console.warn('Subtitle service request failed, retrying', {
        serviceUrl,
        attempt,
        maxAttempts: SUBTITLE_SERVICE_CONNECT_RETRIES,
        error: serializeError(error)
      });
      await sleep(SUBTITLE_SERVICE_CONNECT_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

async function enqueueSubtitleJobWorker({
  jobWorkerUrl,
  audio,
  text,
  textLanguage,
  destSrt
}) {
  const response = await fetchSubtitleServiceWithRetries(jobWorkerUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio,
      text,
      textLanguage,
      destSrt
    })
  });
  const responseBody = await readSubtitleServiceResponse(response);
  if (!response.ok) {
    const message = responseBody?.error || responseBody?.message || `Job worker failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return responseBody;
}

async function writeSubtitleEnqueueFailure({
  paths,
  bookId,
  chapterNumber,
  versionId,
  mp3Path,
  subtitleLanguage,
  jobWorkerUrl,
  error
}) {
  const message = formatErrorMessage(error);
  await writeSubtitleStatus(paths.statusPath, {
    status: 'failed',
    bookId,
    chapterNumber,
    versionId,
    mp3Path,
    transcriptPath: paths.transcriptPath,
    srtPath: paths.srtPath,
    subtitleLanguage,
    completedAt: new Date().toISOString(),
    error: message,
    errorDetails: serializeError(error),
    jobWorkerUrl
  }).catch((statusError) => {
    console.warn('Failed to write subtitle status after job worker error', statusError);
  });
  console.warn('Failed to enqueue subtitle job worker task', {
    bookId,
    chapterNumber,
    versionId,
    subtitleLanguage,
    jobWorkerUrl,
    error: serializeError(error)
  });
}

export function resolveChapterSubtitlePaths({ mp3Path, chapterNumber, versionId = 'base' }) {
  const bookDir = path.dirname(mp3Path);
  const srtFilename = formatChapterAudioFilename(chapterNumber, versionId, '.srt');
  const transcriptFilename = formatChapterAudioFilename(chapterNumber, versionId, '.subtitles.txt');
  const srtPath = path.join(bookDir, srtFilename);
  return {
    bookDir,
    srtFilename,
    srtPath,
    statusPath: `${srtPath}.status.json`,
    transcriptFilename,
    transcriptPath: path.join(bookDir, transcriptFilename)
  };
}

export async function removeChapterSubtitleFiles({ destSrt }) {
  const srtPath = path.isAbsolute(destSrt) ? destSrt : resolveDataRelativePath(destSrt, 'destSrt');
  const statusPath = `${srtPath}.status.json`;
  const parsed = parseChapterSubtitleTarget(path.relative(DATA_DIR, srtPath).split(path.sep).join('/'));
  const transcriptPath = path.join(
    path.dirname(srtPath),
    formatChapterAudioFilename(parsed.chapterNumber, parsed.versionId, '.subtitles.txt')
  );
  for (const targetPath of [srtPath, statusPath, transcriptPath]) {
    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

export async function submitChapterSubtitleJobUpdate({ payload, status = null, srtText = null }) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Subtitle job payload is required');
  }
  const srtPath = resolveDataRelativePath(payload.destSrt, 'destSrt');
  const statusPath = `${srtPath}.status.json`;
  const transcriptPath = resolveDataRelativePath(payload.text, 'text');
  const mp3Path = resolveDataRelativePath(payload.audio, 'audio');
  const relativeSrtPath = path.relative(DATA_DIR, srtPath).split(path.sep).join('/');
  const parsed = parseChapterSubtitleTarget(relativeSrtPath);

  if (typeof srtText === 'string') {
    await fs.mkdir(path.dirname(srtPath), { recursive: true });
    await fs.writeFile(srtPath, srtText, 'utf8');
  }

  if (status && typeof status === 'object') {
    await writeSubtitleStatus(statusPath, {
      status: typeof status.status === 'string' ? status.status : 'running',
      bookId: parsed.bookId,
      chapterNumber: parsed.chapterNumber,
      versionId: parsed.versionId,
      mp3Path,
      transcriptPath,
      srtPath,
      subtitleLanguage:
        typeof payload.textLanguage === 'string' && payload.textLanguage.trim() ? payload.textLanguage.trim() : null,
      jobId: status.jobId ?? null,
      queuedAt: status.queuedAt ?? null,
      startedAt: status.startedAt ?? null,
      completedAt: status.completedAt ?? null,
      error: status.error ?? null,
      errorDetails: status.errorDetails ?? null,
      responseBytes:
        Number.isFinite(status.responseBytes)
          ? status.responseBytes
          : typeof srtText === 'string'
            ? Buffer.byteLength(srtText, 'utf8')
            : null,
      workerUpdatedAt: status.workerUpdatedAt ?? null
    });
  }

  return {
    srtPath,
    statusPath,
    transcriptPath,
    responseBytes: typeof srtText === 'string' ? Buffer.byteLength(srtText, 'utf8') : null
  };
}

export async function startChapterSubtitleGeneration({
  audio,
  text,
  textLanguage,
  destSrt
}) {
  const jobWorkerUrl = resolveJobWorkerUrl();
  if (!jobWorkerUrl) {
    return null;
  }

  const audioPath = path.isAbsolute(audio) ? audio : resolveDataRelativePath(audio, 'audio');
  const textPath = path.isAbsolute(text) ? text : resolveDataRelativePath(text, 'text');
  const srtPath = path.isAbsolute(destSrt) ? destSrt : resolveDataRelativePath(destSrt, 'destSrt');
  const statusPath = `${srtPath}.status.json`;
  const parsed = parseChapterSubtitleTarget(path.relative(DATA_DIR, srtPath).split(path.sep).join('/'));
  await writeSubtitleStatus(statusPath, {
    status: 'queued',
    bookId: parsed.bookId,
    chapterNumber: parsed.chapterNumber,
    versionId: parsed.versionId,
    mp3Path: audioPath,
    transcriptPath: textPath,
    srtPath,
    subtitleLanguage: textLanguage,
    startedAt: new Date().toISOString(),
    error: null
  });

  let result;
  try {
    result = await enqueueSubtitleJobWorker({
      jobWorkerUrl,
      audio: toDataRelativePath(audioPath),
      text: toDataRelativePath(textPath),
      textLanguage,
      destSrt: toDataRelativePath(srtPath)
    });
  } catch (error) {
    await writeSubtitleEnqueueFailure({
      paths: {
        statusPath,
        transcriptPath: textPath,
        srtPath
      },
      bookId: parsed.bookId,
      chapterNumber: parsed.chapterNumber,
      versionId: parsed.versionId,
      mp3Path: audioPath,
      subtitleLanguage: textLanguage,
      jobWorkerUrl,
      error
    });
    throw error;
  }
  return {
    srtPath,
    statusPath,
    transcriptPath: textPath,
    job: result?.job ?? null
  };
}
