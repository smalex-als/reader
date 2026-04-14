import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory, getBookType, loadManifest } from './books.js';
import { safeStat } from './fs.js';
import { deriveTextPathsFromImageUrl } from './paths.js';
import { extractPlainTextFromOcrLayout } from './ocrLayout.js';

const ESTIMATED_LISTEN_WORDS_PER_MINUTE = 155;

function countWords(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function createStats(plainText) {
  const normalized = typeof plainText === 'string' ? plainText.trim() : '';
  const wordCount = countWords(normalized);
  const charCount = normalized.length;
  const listeningSeconds =
    wordCount > 0 ? Math.max(1, Math.round((wordCount / ESTIMATED_LISTEN_WORDS_PER_MINUTE) * 60)) : 0;
  return { wordCount, charCount, listeningSeconds };
}

async function readImagePagePlainText(imageUrl) {
  const { textAbsolute } = deriveTextPathsFromImageUrl(imageUrl);
  const stat = await safeStat(textAbsolute);
  if (!stat?.isFile()) {
    return '';
  }
  const rawText = await fs.readFile(textAbsolute, 'utf8');
  return extractPlainTextFromOcrLayout(rawText).trim();
}

async function readTextChapterPlainText(bookId, chapterNumber) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, `chapter${String(chapterNumber).padStart(3, '0')}.txt`);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    return '';
  }
  return (await fs.readFile(filePath, 'utf8')).trim();
}

export async function attachTocStats(bookId, tocEntries) {
  const entries = Array.isArray(tocEntries) ? tocEntries : [];
  if (entries.length === 0) {
    return [];
  }

  const bookType = await getBookType(bookId);

  if (bookType === 'text') {
    return Promise.all(
      entries.map(async (entry) => {
        const chapterNumber = Number.isInteger(entry.page) ? entry.page + 1 : null;
        const plainText = chapterNumber ? await readTextChapterPlainText(bookId, chapterNumber) : '';
        return {
          ...entry,
          stats: createStats(plainText)
        };
      })
    );
  }

  const manifest = await loadManifest(bookId);
  return Promise.all(
    entries.map(async (entry, index) => {
      const pageStart = Number.isInteger(entry.page) ? entry.page : -1;
      const nextPage = entries
        .slice(index + 1)
        .map((candidate) => candidate.page)
        .find((page) => Number.isInteger(page) && page > pageStart);
      const pageEnd =
        Number.isInteger(nextPage) && nextPage > pageStart ? Math.min(nextPage, manifest.length) : manifest.length;
      if (pageStart < 0 || pageStart >= manifest.length || pageEnd <= pageStart) {
        return {
          ...entry,
          stats: createStats('')
        };
      }
      const imageUrls = manifest.slice(pageStart, pageEnd);
      const chunks = await Promise.all(imageUrls.map((imageUrl) => readImagePagePlainText(imageUrl)));
      return {
        ...entry,
        stats: createStats(chunks.filter(Boolean).join('\n\n'))
      };
    })
  );
}
