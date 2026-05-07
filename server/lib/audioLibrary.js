import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../config.js';
import { listBookCards } from './books.js';
import { safeStat } from './fs.js';
import { loadToc } from './toc.js';
import { formatChapterAudioFilename } from './streamAudio.js';

const execFileAsync = promisify(execFile);
const CHAPTER_AUDIO_RE = /^chapter(\d+)(?:\.(.+))?\.mp3$/i;

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
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
  } catch {
    return null;
  }
}

function parseChapterAudioFilename(filename) {
  const match = filename.match(CHAPTER_AUDIO_RE);
  if (!match) {
    return null;
  }
  const chapterNumber = Number.parseInt(match[1], 10);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    return null;
  }
  return {
    chapterNumber,
    versionId: match[2]?.trim() || 'base'
  };
}

function normalizeProvider(value) {
  return value === 'xai' || value === 'yandex' ? value : 'default';
}

export async function listGeneratedAudio() {
  const bookCards = await listBookCards();
  const posts = [];

  await Promise.all(
    bookCards.map(async (card) => {
      const bookId = card.book;
      const bookDir = path.join(DATA_DIR, bookId);
      const [entries, toc] = await Promise.all([
        fs.readdir(bookDir, { withFileTypes: true }).catch(() => []),
        loadToc(bookId).catch(() => [])
      ]);

      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .map(async (filename) => {
            const parsed = parseChapterAudioFilename(filename);
            if (!parsed) {
              return;
            }
            const audioPath = path.join(bookDir, filename);
            const [audioStat, meta] = await Promise.all([
              safeStat(audioPath),
              readJsonFile(`${audioPath}.meta.json`)
            ]);
            if (!audioStat?.isFile?.()) {
              return;
            }
            const versionId =
              typeof meta?.versionId === 'string' && meta.versionId.trim()
                ? meta.versionId.trim()
                : parsed.versionId;
            const srtFilename = formatChapterAudioFilename(parsed.chapterNumber, versionId, '.srt');
            const srtPath = path.join(bookDir, srtFilename);
            const srtStat = await safeStat(srtPath);
            const durationSeconds = await getAudioDurationSeconds(audioPath);
            const tocEntry = toc[parsed.chapterNumber - 1] ?? null;
            const chapterTitle =
              typeof tocEntry?.title === 'string' && tocEntry.title.trim()
                ? tocEntry.title.trim()
                : `Chapter ${parsed.chapterNumber}`;
            const generatedAt =
              typeof meta?.generatedAt === 'string' && meta.generatedAt.trim()
                ? meta.generatedAt.trim()
                : audioStat.mtime.toISOString();

            posts.push({
              id: `${bookId}:${parsed.chapterNumber}:${versionId}`,
              bookId,
              bookTitle: card.title || bookId,
              bookAuthor: card.author || '',
              chapterNumber: parsed.chapterNumber,
              chapterTitle,
              versionId,
              provider: normalizeProvider(meta?.provider),
              voice: typeof meta?.voice === 'string' ? meta.voice : null,
              audioUrl: `/data/${bookId}/${filename}`,
              srtUrl: srtStat?.isFile?.() ? `/data/${bookId}/${srtFilename}` : null,
              hasSubtitles: Boolean(srtStat?.isFile?.()),
              bytes: audioStat.size,
              durationSeconds,
              generatedAt,
              subchapters: Array.isArray(meta?.subchapters) ? meta.subchapters : []
            });
          })
      );
    })
  );

  posts.sort((left, right) => {
    const rightTime = Date.parse(right.generatedAt) || 0;
    const leftTime = Date.parse(left.generatedAt) || 0;
    return rightTime - leftTime || left.bookTitle.localeCompare(right.bookTitle);
  });

  return posts;
}
