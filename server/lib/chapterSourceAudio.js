import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { YT_DLP_BIN } from '../config.js';
import { createHttpError } from './errors.js';
import { assertBookDirectory } from './books.js';
import { safeStat, writeFileAtomic } from './fs.js';
import {
  enqueueBackgroundJob,
  isBackgroundQueueEnabled,
  YOUTUBE_AUDIO_JOB_NAME
} from './backgroundJobs.js';

const execFileAsync = promisify(execFile);
const CHAPTER_PAD_LENGTH = 3;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

function formatChapterPrefix(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}`;
}

export function normalizeYouTubeUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw createHttpError(400, 'Valid YouTube URL is required');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw createHttpError(400, 'Only YouTube URLs are supported');
  }
  parsed.hash = '';
  return parsed.toString();
}

export function formatChapterSourceAudioFilename(chapterNumber) {
  return `${formatChapterPrefix(chapterNumber)}.mp3`;
}

function formatChapterSourceMetadataFilename(chapterNumber) {
  return `${formatChapterPrefix(chapterNumber)}.youtube.json`;
}

function formatLegacyChapterSourceAudioFilename(chapterNumber) {
  return `${formatChapterPrefix(chapterNumber)}.source.mp3`;
}

function formatLegacyChapterSourceMetadataFilename(chapterNumber) {
  return `${formatChapterPrefix(chapterNumber)}.source.json`;
}

export function buildYouTubeDownloadArgs({ sourceUrl, outputTemplate }) {
  return [
    '--ignore-config',
    '--no-playlist',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '--force-overwrites',
    '--no-progress',
    '--output',
    outputTemplate,
    sourceUrl
  ];
}

async function writeSourceMetadata(directory, chapterNumber, metadata) {
  const metadataPath = path.join(directory, formatChapterSourceMetadataFilename(chapterNumber));
  await writeFileAtomic(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

async function loadSourceMetadata(directory, chapterNumber) {
  const filenames = [
    formatChapterSourceMetadataFilename(chapterNumber),
    formatLegacyChapterSourceMetadataFilename(chapterNumber)
  ];
  for (const filename of filenames) {
    try {
      return JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
        throw error;
      }
    }
  }
  return null;
}

export async function getYouTubeAudioDownload({ bookId, chapterNumber }) {
  const directory = await assertBookDirectory(bookId);
  const metadata = await loadSourceMetadata(directory, chapterNumber);
  if (!metadata) {
    return null;
  }
  const currentMetadataPath = path.join(directory, formatChapterSourceMetadataFilename(chapterNumber));
  const legacyMetadataPath = path.join(directory, formatLegacyChapterSourceMetadataFilename(chapterNumber));
  if (!(await safeStat(currentMetadataPath))?.isFile()) {
    await writeSourceMetadata(directory, chapterNumber, metadata);
    await fs.rm(legacyMetadataPath, { force: true });
  }
  if (metadata.status !== 'completed') {
    return metadata;
  }
  const audioFilename = formatChapterSourceAudioFilename(chapterNumber);
  const audioPath = path.join(directory, audioFilename);
  const legacyAudioPath = path.join(directory, formatLegacyChapterSourceAudioFilename(chapterNumber));
  let audioStat = await safeStat(audioPath);
  if (!audioStat?.isFile()) {
    const legacyAudioStat = await safeStat(legacyAudioPath);
    if (legacyAudioStat?.isFile()) {
      await fs.rename(legacyAudioPath, audioPath);
      audioStat = legacyAudioStat;
    }
  }
  if (audioStat?.isFile() && audioStat.size > 0) {
    const completed = {
      ...metadata,
      audioUrl: `/data/${bookId}/${audioFilename}`,
      bytes: audioStat.size
    };
    await writeSourceMetadata(directory, chapterNumber, completed);
    return completed;
  }
  return {
    ...metadata,
    status: 'failed',
    audioUrl: null,
    error: 'Downloaded MP3 file is missing'
  };
}

export async function runYouTubeAudioDownloadJob({
  bookId,
  chapterNumber,
  sourceUrl,
  jobId
}) {
  const directory = await assertBookDirectory(bookId);
  const normalizedUrl = normalizeYouTubeUrl(sourceUrl);
  const current = await loadSourceMetadata(directory, chapterNumber);
  if (current?.jobId !== jobId) {
    return null;
  }
  const prefix = formatChapterPrefix(chapterNumber);
  const temporaryBase = `${prefix}.youtube-${jobId}.download`;
  const outputTemplate = path.join(directory, `${temporaryBase}.%(ext)s`);
  const temporaryMp3Path = path.join(directory, `${temporaryBase}.mp3`);
  const finalFilename = formatChapterSourceAudioFilename(chapterNumber);
  const finalPath = path.join(directory, finalFilename);
  const baseMetadata = {
    ...current,
    source: 'youtube',
    sourceUrl: normalizedUrl,
    jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    error: null
  };
  await writeSourceMetadata(directory, chapterNumber, baseMetadata);

  try {
    await fs.rm(temporaryMp3Path, { force: true });
    await execFileAsync(
      YT_DLP_BIN,
      buildYouTubeDownloadArgs({ sourceUrl: normalizedUrl, outputTemplate }),
      { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
    );
    const downloaded = await safeStat(temporaryMp3Path);
    if (!downloaded?.isFile() || downloaded.size <= 0) {
      throw createHttpError(502, 'yt-dlp did not produce an MP3 file');
    }
    const latest = await loadSourceMetadata(directory, chapterNumber);
    if (latest?.jobId !== jobId) {
      await fs.rm(temporaryMp3Path, { force: true });
      return null;
    }
    await fs.rename(temporaryMp3Path, finalPath);
    return writeSourceMetadata(directory, chapterNumber, {
      ...baseMetadata,
      status: 'completed',
      completedAt: new Date().toISOString(),
      audioUrl: `/data/${bookId}/${finalFilename}`,
      bytes: downloaded.size
    });
  } catch (error) {
    await fs.rm(temporaryMp3Path, { force: true }).catch(() => {});
    const latest = await loadSourceMetadata(directory, chapterNumber);
    if (latest?.jobId === jobId) {
      await writeSourceMetadata(directory, chapterNumber, {
        ...baseMetadata,
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'YouTube audio download failed'
      });
    }
    throw error;
  }
}

export async function enqueueYouTubeAudioDownload({ bookId, chapterNumber, sourceUrl }) {
  const directory = await assertBookDirectory(bookId);
  const normalizedUrl = normalizeYouTubeUrl(sourceUrl);
  const jobId = randomUUID();
  const queued = await writeSourceMetadata(directory, chapterNumber, {
    source: 'youtube',
    sourceUrl: normalizedUrl,
    jobId,
    status: 'queued',
    queuedAt: new Date().toISOString(),
    error: null,
    audioUrl: null
  });
  const payload = { bookId, chapterNumber, sourceUrl: normalizedUrl, jobId };
  if (isBackgroundQueueEnabled()) {
    try {
      await enqueueBackgroundJob(YOUTUBE_AUDIO_JOB_NAME, payload, { jobId });
    } catch (error) {
      return writeSourceMetadata(directory, chapterNumber, {
        ...queued,
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unable to queue YouTube download'
      });
    }
  } else {
    setImmediate(() => {
      void runYouTubeAudioDownloadJob(payload).catch((error) => {
        console.error('YouTube audio download failed', error);
      });
    });
  }
  return queued;
}
