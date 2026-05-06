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
  DATA_DIR
} from '../config.js';
import { formatChapterAudioFilename } from './streamAudio.js';
import { safeStat } from './fs.js';

const OUTPUT_LIMIT = 12_000;

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function truncateOutput(value) {
  const text = String(value || '');
  return text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text;
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
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        audio: toDataRelativePath(mp3Path),
        text: toDataRelativePath(paths.transcriptPath),
        out: toDataRelativePath(paths.srtPath),
        language: subtitleLanguage,
        skipValidate: CHAPTER_SUBTITLES_SKIP_VALIDATE,
        sentenceMode: CHAPTER_SUBTITLES_SENTENCE_MODE.trim() || 'strict',
        maxLineChars: resolveMaxLineChars(),
        beam: resolveBeam(),
        retryBeam: resolveRetryBeam()
      }),
      signal: controller.signal
    });
    const responseBody = await readSubtitleServiceResponse(response);
    if (!response.ok) {
      const message = responseBody?.error || responseBody?.message || `Subtitle service failed with HTTP ${response.status}`;
      throw new Error(message);
    }

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
      response: responseBody
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
      : error instanceof Error
        ? error.message
        : String(error);
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
      message
    });
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
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

export async function startChapterSubtitleGeneration({
  bookId,
  chapterNumber,
  versionId = 'base',
  mp3Path,
  transcriptText
}) {
  const cleanTranscript = typeof transcriptText === 'string' ? transcriptText.trim() : '';
  if (!cleanTranscript) {
    return null;
  }

  const paths = resolveChapterSubtitlePaths({ mp3Path, chapterNumber, versionId });
  const subtitleLanguage = resolveSubtitleLanguage(cleanTranscript);
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
  const command = serviceUrl
    ? ''
    : CHAPTER_SUBTITLES_COMMAND.trim()
      ? renderCommand(CHAPTER_SUBTITLES_COMMAND.trim(), templateVariables)
      : buildCommandFromImage({ paths, mp3Path, transcriptText: cleanTranscript });
  if (!serviceUrl && !command) {
    return null;
  }

  await fs.writeFile(paths.transcriptPath, `${cleanTranscript}\n`, 'utf8');
  await writeSubtitleStatus(paths.statusPath, {
    status: 'running',
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
