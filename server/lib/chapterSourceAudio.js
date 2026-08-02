import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { YT_DLP_BIN } from '../config.js';
import { createHttpError } from './errors.js';
import { assertBookDirectory } from './books.js';
import { safeStat, writeFileAtomic } from './fs.js';
import { updateTocTitle } from './toc.js';
import { cleanTranscriptionText, transcribeAudioWithOpenAI } from './openaiTranscription.js';
import { createChapterTextVersion } from './chapterTextVersions.js';
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
    '--print',
    'after_move:%(title)s',
    sourceUrl
  ];
}

export function extractYouTubeVideoTitle(output) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || '').slice(0, 300);
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
    let transcriptCleaned = Boolean(metadata.transcriptCleaned);
    if (metadata.transcriptReady && !transcriptCleaned) {
      const chapterTextPath = path.join(directory, `${formatChapterPrefix(chapterNumber)}.txt`);
      try {
        const chapterText = await fs.readFile(chapterTextPath, 'utf8');
        const cleaned = cleanTranscriptionText(chapterText);
        if (cleaned && cleaned !== chapterText.trim()) {
          await writeFileAtomic(chapterTextPath, `${cleaned}\n`);
        }
        transcriptCleaned = true;
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }
    const completed = {
      ...metadata,
      audioUrl: `/data/${bookId}/${audioFilename}`,
      bytes: audioStat.size,
      transcriptCleaned
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
  jobId,
  postProcessPromptId = null,
  postProcessPromptName = null,
  postProcessOperationId = null
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
  const chapterTextPath = path.join(directory, `${prefix}.txt`);
  const baseMetadata = {
    ...current,
    source: 'youtube',
    sourceUrl: normalizedUrl,
    jobId,
    status: 'running',
    transcriptionModel: 'gpt-transcribe',
    startedAt: new Date().toISOString(),
    error: null
  };
  await writeSourceMetadata(directory, chapterNumber, baseMetadata);
  let failureMetadata = baseMetadata;

  try {
    const existingAudio = current?.audioUrl ? await safeStat(finalPath) : null;
    let downloaded = existingAudio?.isFile() && existingAudio.size > 0 ? existingAudio : null;
    let videoTitle = current?.videoTitle || '';
    if (!downloaded) {
      await fs.rm(temporaryMp3Path, { force: true });
      const { stdout } = await execFileAsync(
        YT_DLP_BIN,
        buildYouTubeDownloadArgs({ sourceUrl: normalizedUrl, outputTemplate }),
        { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
      );
      videoTitle = extractYouTubeVideoTitle(stdout);
      downloaded = await safeStat(temporaryMp3Path);
      if (!downloaded?.isFile() || downloaded.size <= 0) {
        throw createHttpError(502, 'yt-dlp did not produce an MP3 file');
      }
      const latest = await loadSourceMetadata(directory, chapterNumber);
      if (latest?.jobId !== jobId) {
        await fs.rm(temporaryMp3Path, { force: true });
        return null;
      }
      await fs.rename(temporaryMp3Path, finalPath);
    }
    if (videoTitle) {
      try {
        await updateTocTitle(bookId, chapterNumber - 1, videoTitle);
      } catch (error) {
        console.warn('Unable to update chapter title from YouTube metadata', error);
      }
    }
    const canReuseTranscript = Boolean(
      current?.transcriptReady &&
      postProcessPromptId &&
      (await safeStat(chapterTextPath))?.isFile()
    );
    failureMetadata = await writeSourceMetadata(directory, chapterNumber, {
      ...baseMetadata,
      status: canReuseTranscript ? 'post-processing' : 'transcribing',
      downloadedAt: new Date().toISOString(),
      videoTitle: videoTitle || null,
      audioUrl: `/data/${bookId}/${finalFilename}`,
      bytes: downloaded.size,
      transcriptReady: canReuseTranscript
    });
    let transcriptReady = canReuseTranscript;
    if (!transcriptReady) {
      const transcript = cleanTranscriptionText(await transcribeAudioWithOpenAI(finalPath));
      if (!transcript) {
        throw createHttpError(502, 'gpt-transcribe produced an empty transcript');
      }
      await writeFileAtomic(chapterTextPath, `${transcript}\n`);
      transcriptReady = true;
    }
    let postProcessVersionId = null;
    if (transcriptReady && postProcessPromptId) {
      failureMetadata = await writeSourceMetadata(directory, chapterNumber, {
        ...failureMetadata,
        status: 'post-processing',
        transcriptReady: true,
        transcriptCleaned: true,
        postProcessPromptId,
        postProcessPromptName
      });
      const version = await createChapterTextVersion({
        bookId,
        chapterNumber,
        sourceVersionId: 'base',
        promptId: postProcessPromptId,
        operationId: postProcessOperationId
      });
      postProcessVersionId = version.createdVersionId ?? null;
    }
    return writeSourceMetadata(directory, chapterNumber, {
      ...failureMetadata,
      status: 'completed',
      completedAt: new Date().toISOString(),
      transcriptReady,
      transcriptCleaned: transcriptReady,
      postProcessVersionId
    });
  } catch (error) {
    await fs.rm(temporaryMp3Path, { force: true }).catch(() => {});
    const latest = await loadSourceMetadata(directory, chapterNumber);
    if (latest?.jobId === jobId) {
      await writeSourceMetadata(directory, chapterNumber, {
        ...failureMetadata,
        status: 'failed',
        failedAt: new Date().toISOString(),
        failureStage: failureMetadata.status,
        error: error instanceof Error ? error.message : 'YouTube chapter import failed'
      });
    }
    throw error;
  }
}

export async function enqueueYouTubeAudioDownload({
  bookId,
  chapterNumber,
  sourceUrl,
  postProcessPromptId = null,
  postProcessPromptName = null
}) {
  const directory = await assertBookDirectory(bookId);
  const normalizedUrl = normalizeYouTubeUrl(sourceUrl);
  const existing = await loadSourceMetadata(directory, chapterNumber);
  const jobId = randomUUID();
  const postProcessOperationId = postProcessPromptId
    ? existing?.postProcessPromptId === postProcessPromptId && existing?.postProcessOperationId
      ? existing.postProcessOperationId
      : randomUUID()
    : null;
  const queued = await writeSourceMetadata(directory, chapterNumber, {
    ...existing,
    source: 'youtube',
    sourceUrl: normalizedUrl,
    jobId,
    status: 'queued',
    transcriptionModel: 'gpt-transcribe',
    queuedAt: new Date().toISOString(),
    completedAt: null,
    failedAt: null,
    transcriptReady: Boolean(
      existing?.failureStage === 'post-processing' &&
      existing?.transcriptReady
    ),
    postProcessPromptId,
    postProcessPromptName,
    postProcessOperationId,
    postProcessVersionId: null,
    failureStage: null,
    error: null
  });
  const payload = {
    bookId,
    chapterNumber,
    sourceUrl: normalizedUrl,
    jobId,
    postProcessPromptId,
    postProcessPromptName,
    postProcessOperationId
  };
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
