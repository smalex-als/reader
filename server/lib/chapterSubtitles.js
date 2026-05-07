import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  CHAPTER_SUBTITLES_BEAM,
  CHAPTER_SUBTITLES_COMMAND,
  CHAPTER_SUBTITLES_DOCKER_USER,
  CHAPTER_SUBTITLES_IMAGE,
  CHAPTER_SUBTITLES_LANGUAGE,
  CHAPTER_SUBTITLES_MAX_LINE_CHARS,
  CHAPTER_SUBTITLES_RETRY_BEAM,
  CHAPTER_SUBTITLES_SENTENCE_MODE,
  CHAPTER_SUBTITLES_SKIP_VALIDATE,
  CHAPTER_SUBTITLES_TIMEOUT_MS,
  CHAPTER_SUBTITLES_URL,
  CHAPTER_JOBWORKER_URL,
  DATA_DIR
} from '../config.js';
import { formatChapterAudioFilename } from './streamAudio.js';
import { safeStat } from './fs.js';

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

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

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

function renderCommand(template, variables) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!(key in variables)) {
      return match;
    }
    if (variables[key] === '') {
      return '';
    }
    return shellQuote(variables[key]);
  });
}

function resolveSubtitleLanguage(transcriptText) {
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

function resolveSubtitleServiceUrl() {
  const configured = CHAPTER_SUBTITLES_URL.trim();
  if (!configured) {
    return '';
  }
  const url = new URL(configured);
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/generate';
  }
  return url.toString();
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

function buildCommandFromImage({ paths, mp3Path, transcriptText }) {
  const image = CHAPTER_SUBTITLES_IMAGE.trim();
  if (!image) {
    return '';
  }
  const language = resolveSubtitleLanguage(transcriptText);
  const sentenceMode = CHAPTER_SUBTITLES_SENTENCE_MODE.trim() || 'strict';
  const args = [
    'docker',
    'run',
    '--rm'
  ];
  const user = CHAPTER_SUBTITLES_DOCKER_USER.trim();
  if (user) {
    args.push('--user', user);
  }
  args.push(
    '-v',
    `${paths.bookDir}:/data`,
    image,
    '--audio',
    path.basename(mp3Path),
    '--text',
    paths.transcriptFilename,
    '--out',
    paths.srtFilename,
    '--language',
    language
  );
  if (CHAPTER_SUBTITLES_SKIP_VALIDATE) {
    args.push('--skip-validate');
  }
  args.push(
    '--sentence-mode',
    sentenceMode,
    '--max-line-chars',
    String(resolveMaxLineChars()),
    '--beam',
    String(resolveBeam()),
    '--retry-beam',
    String(resolveRetryBeam())
  );
  return args.map(shellQuote).join(' ');
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

async function runSubtitleServiceRequest({
  serviceUrl,
  paths,
  bookId,
  chapterNumber,
  versionId,
  mp3Path,
  subtitleLanguage
}) {
  const controller = new AbortController();
  const timeout = Number.isFinite(CHAPTER_SUBTITLES_TIMEOUT_MS) && CHAPTER_SUBTITLES_TIMEOUT_MS > 0
    ? setTimeout(() => controller.abort(), CHAPTER_SUBTITLES_TIMEOUT_MS)
    : null;

  try {
    const response = await fetchSubtitleServiceWithRetries(serviceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        audio: toDataRelativePath(mp3Path),
        text: toDataRelativePath(paths.transcriptPath),
        out: paths.srtFilename,
        language: subtitleLanguage,
        skipValidate: CHAPTER_SUBTITLES_SKIP_VALIDATE,
        sentenceMode: CHAPTER_SUBTITLES_SENTENCE_MODE.trim() || 'strict',
        maxLineChars: resolveMaxLineChars(),
        beam: resolveBeam(),
        retryBeam: resolveRetryBeam()
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const responseBody = await readSubtitleServiceResponse(response);
      const message = responseBody?.error || responseBody?.message || `Subtitle service failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const srtText = await response.text();
    if (!srtText.trim()) {
      throw new Error('Subtitle service returned an empty SRT file');
    }
    await fs.writeFile(paths.srtPath, srtText, 'utf8');
    const srtStat = await safeStat(paths.srtPath);
    const ok = srtStat?.isFile?.();
    await writeSubtitleStatus(paths.statusPath, {
      status: ok ? 'completed' : 'failed',
      bookId,
      chapterNumber,
      versionId,
      mp3Path,
      transcriptPath: paths.transcriptPath,
      srtPath: paths.srtPath,
      subtitleLanguage,
      completedAt: new Date().toISOString(),
      error: ok ? null : 'Subtitle service completed without writing SRT file',
      serviceUrl,
      responseBytes: Buffer.byteLength(srtText, 'utf8')
    });
    if (!ok) {
      console.warn('Chapter subtitle service did not write SRT file', {
        bookId,
        chapterNumber,
        versionId,
        subtitleLanguage,
        serviceUrl
      });
    }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Subtitle service request timed out'
      : formatErrorMessage(error);
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
      serviceUrl
    }).catch((statusError) => {
      console.warn('Failed to write subtitle status after service error', statusError);
    });
    console.warn('Chapter subtitle service generation failed', {
      bookId,
      chapterNumber,
      versionId,
      subtitleLanguage,
      serviceUrl,
      error: serializeError(error)
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function enqueueSubtitleJobWorker({
  jobWorkerUrl,
  paths,
  bookId,
  chapterNumber,
  versionId,
  mp3Path,
  subtitleLanguage,
  force = false
}) {
  try {
    const response = await fetchSubtitleServiceWithRetries(jobWorkerUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        bookId,
        chapterNumber,
        versionId,
        audio: toDataRelativePath(mp3Path),
        text: toDataRelativePath(paths.transcriptPath),
        out: toDataRelativePath(paths.srtPath),
        status: toDataRelativePath(paths.statusPath),
        language: subtitleLanguage,
        force,
        skipValidate: CHAPTER_SUBTITLES_SKIP_VALIDATE,
        sentenceMode: CHAPTER_SUBTITLES_SENTENCE_MODE.trim() || 'strict',
        maxLineChars: resolveMaxLineChars(),
        beam: resolveBeam(),
        retryBeam: resolveRetryBeam()
      })
    });
    const responseBody = await readSubtitleServiceResponse(response);
    if (!response.ok) {
      const message = responseBody?.error || responseBody?.message || `Job worker failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    return responseBody;
  } catch (error) {
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
    throw error;
  }
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

export async function removeChapterSubtitleFiles({ bookId, chapterNumber, versionId = 'base', mp3Path = null }) {
  const resolvedVersionId = typeof versionId === 'string' && versionId.trim() ? versionId.trim() : 'base';
  const resolvedMp3Path =
    mp3Path ?? path.join(DATA_DIR, bookId, formatChapterAudioFilename(chapterNumber, resolvedVersionId));
  const paths = resolveChapterSubtitlePaths({ mp3Path: resolvedMp3Path, chapterNumber, versionId: resolvedVersionId });
  for (const targetPath of [paths.srtPath, paths.statusPath, paths.transcriptPath]) {
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
  const srtPath = resolveDataRelativePath(payload.out, 'out');
  const statusPath = resolveDataRelativePath(payload.status || `${payload.out}.status.json`, 'status');
  const transcriptPath = resolveDataRelativePath(payload.text, 'text');
  const mp3Path = resolveDataRelativePath(payload.audio, 'audio');

  if (typeof srtText === 'string') {
    await fs.mkdir(path.dirname(srtPath), { recursive: true });
    await fs.writeFile(srtPath, srtText, 'utf8');
  }

  if (status && typeof status === 'object') {
    await writeSubtitleStatus(statusPath, {
      status: typeof status.status === 'string' ? status.status : 'running',
      bookId: typeof payload.bookId === 'string' ? payload.bookId : null,
      chapterNumber: Number.isInteger(payload.chapterNumber) ? payload.chapterNumber : null,
      versionId: typeof payload.versionId === 'string' && payload.versionId.trim() ? payload.versionId.trim() : 'base',
      mp3Path,
      transcriptPath,
      srtPath,
      subtitleLanguage: typeof payload.language === 'string' && payload.language.trim() ? payload.language.trim() : null,
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
  bookId,
  chapterNumber,
  versionId = 'base',
  mp3Path,
  transcriptText,
  force = false
}) {
  const cleanTranscript = typeof transcriptText === 'string' ? transcriptText.trim() : '';
  if (!cleanTranscript) {
    return null;
  }

  const paths = resolveChapterSubtitlePaths({ mp3Path, chapterNumber, versionId });
  const subtitleLanguage = resolveSubtitleLanguage(cleanTranscript);
  const jobWorkerUrl = resolveJobWorkerUrl();
  const serviceUrl = resolveSubtitleServiceUrl();
  const templateVariables = {
    audioFile: path.basename(mp3Path),
    audioPath: mp3Path,
    bookDir: paths.bookDir,
    bookId,
    chapterNumber,
    beam: String(resolveBeam()),
    maxLineChars: String(resolveMaxLineChars()),
    retryBeam: String(resolveRetryBeam()),
    sentenceMode: CHAPTER_SUBTITLES_SENTENCE_MODE.trim() || 'strict',
    skipValidateFlag: CHAPTER_SUBTITLES_SKIP_VALIDATE ? '--skip-validate' : '',
    srtFile: paths.srtFilename,
    srtPath: paths.srtPath,
    subtitleLanguage,
    transcriptFile: paths.transcriptFilename,
    transcriptPath: paths.transcriptPath,
    versionId
  };
  const command = jobWorkerUrl || serviceUrl
    ? ''
    : CHAPTER_SUBTITLES_COMMAND.trim()
      ? renderCommand(CHAPTER_SUBTITLES_COMMAND.trim(), templateVariables)
      : buildCommandFromImage({ paths, mp3Path, transcriptText: cleanTranscript });
  if (!jobWorkerUrl && !serviceUrl && !command) {
    return null;
  }

  if (force) {
    await removeChapterSubtitleFiles({ bookId, chapterNumber, versionId, mp3Path });
  }
  await fs.writeFile(paths.transcriptPath, `${cleanTranscript}\n`, 'utf8');
  await writeSubtitleStatus(paths.statusPath, {
    status: jobWorkerUrl ? 'queued' : 'running',
    bookId,
    chapterNumber,
    versionId,
    mp3Path,
    transcriptPath: paths.transcriptPath,
    srtPath: paths.srtPath,
    subtitleLanguage,
    startedAt: new Date().toISOString(),
    error: null
  });

  if (jobWorkerUrl) {
    const result = await enqueueSubtitleJobWorker({
      jobWorkerUrl,
      paths,
      bookId,
      chapterNumber,
      versionId,
      mp3Path,
      subtitleLanguage,
      force
    });
    return {
      srtPath: paths.srtPath,
      statusPath: paths.statusPath,
      transcriptPath: paths.transcriptPath,
      job: result?.job ?? null
    };
  }

  if (serviceUrl) {
    void runSubtitleServiceRequest({
      serviceUrl,
      paths,
      bookId,
      chapterNumber,
      versionId,
      mp3Path,
      subtitleLanguage
    });
    return {
      srtPath: paths.srtPath,
      statusPath: paths.statusPath,
      transcriptPath: paths.transcriptPath
    };
  }

  const child = spawn('/bin/sh', ['-lc', command], {
    cwd: paths.bookDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  const timeout = Number.isFinite(CHAPTER_SUBTITLES_TIMEOUT_MS) && CHAPTER_SUBTITLES_TIMEOUT_MS > 0
    ? setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, CHAPTER_SUBTITLES_TIMEOUT_MS)
    : null;

  child.stdout?.on('data', (chunk) => {
    stdout = truncateOutput(stdout + chunk.toString());
  });
  child.stderr?.on('data', (chunk) => {
    stderr = truncateOutput(stderr + chunk.toString());
  });
  child.on('error', async (error) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    await writeSubtitleStatus(paths.statusPath, {
      status: 'failed',
      bookId,
      chapterNumber,
      versionId,
      mp3Path,
      transcriptPath: paths.transcriptPath,
      srtPath: paths.srtPath,
      subtitleLanguage,
      error: error instanceof Error ? error.message : 'Failed to start subtitle generation'
    }).catch((statusError) => {
      console.warn('Failed to write subtitle status after process error', statusError);
    });
  });
  child.on('close', async (code, signal) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    const srtStat = await safeStat(paths.srtPath);
    const ok = code === 0 && srtStat?.isFile?.();
    const error = ok
      ? null
      : timedOut
        ? 'Subtitle generation timed out'
        : `Subtitle generation failed${code === null ? '' : ` with exit code ${code}`}`;
    await writeSubtitleStatus(paths.statusPath, {
      status: ok ? 'completed' : 'failed',
      bookId,
      chapterNumber,
      versionId,
      mp3Path,
      transcriptPath: paths.transcriptPath,
      srtPath: paths.srtPath,
      subtitleLanguage,
      completedAt: new Date().toISOString(),
      error,
      exitCode: code,
      signal,
      stdout: truncateOutput(stdout).trim() || null,
      stderr: truncateOutput(stderr).trim() || null
    }).catch((statusError) => {
      console.warn('Failed to write subtitle status after process close', statusError);
    });
    if (!ok) {
      console.warn('Chapter subtitle generation failed', {
        bookId,
        chapterNumber,
        versionId,
        subtitleLanguage,
        code,
        signal,
        error,
        stderr: truncateOutput(stderr).trim()
      });
    }
  });

  return {
    srtPath: paths.srtPath,
    statusPath: paths.statusPath,
    transcriptPath: paths.transcriptPath
  };
}
