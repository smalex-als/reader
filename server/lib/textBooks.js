import fs from 'node:fs/promises';
import path from 'node:path';
import { TOC_FILENAME } from '../config.js';
import { createHttpError } from './errors.js';
import { ensureDataDir, safeStat } from './fs.js';
import {
  assertBookDirectory,
  getBookDirectory,
  getBookType,
  loadBookMeta,
  saveBookMeta
} from './books.js';

const CHAPTER_PAD_LENGTH = 3;

function slugifyBookId(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80) || 'book'
  );
}

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function extractChapterTitle(rawText, fallback) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) {
    return fallback;
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      const cleaned = trimmed.replace(/^#+\s*/, '').trim();
      return cleaned || fallback;
    }
    if (trimmed.length <= 80) {
      return trimmed;
    }
    break;
  }
  return fallback;
}

async function loadRawToc(bookId) {
  const directory = await assertBookDirectory(bookId);
  const tocPath = path.join(directory, TOC_FILENAME);
  const stat = await safeStat(tocPath);
  if (!stat?.isFile()) {
    return [];
  }
  try {
    const raw = await fs.readFile(tocPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRawToc(bookId, entries) {
  const directory = await assertBookDirectory(bookId);
  const tocPath = path.join(directory, TOC_FILENAME);
  await fs.writeFile(tocPath, JSON.stringify(entries, null, 2), 'utf8');
  return entries;
}

function normalizeTocEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  const page = Number.parseInt(entry.page, 10);
  if (!title || !Number.isInteger(page) || page < 0) {
    return null;
  }
  return { title, page };
}

async function listChapterNumbers(bookId) {
  const directory = await assertBookDirectory(bookId);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const numbers = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const match = entry.name.match(/^chapter(\d+)\.txt$/i);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isInteger(value)) {
      numbers.push(value);
    }
  }
  return numbers;
}

export async function getTextChapterCount(bookId) {
  const numbers = await listChapterNumbers(bookId);
  return numbers.length;
}

export async function createTextBook(bookName) {
  const cleaned = String(bookName || '').trim();
  if (!cleaned) {
    throw createHttpError(400, 'Book name is required');
  }
  ensureDataDir();
  const baseId = slugifyBookId(cleaned);
  let bookId = baseId;
  let suffix = 1;
  while (await safeStat(getBookDirectory(bookId))) {
    bookId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const bookDir = getBookDirectory(bookId);
  await fs.mkdir(bookDir, { recursive: true });
  await saveBookMeta(bookId, { type: 'text', title: cleaned, createdAt: new Date().toISOString() });
  return bookId;
}

export async function addTextChapter(bookId, { title, content }) {
  const bookType = await getBookType(bookId);
  if (bookType !== 'text') {
    throw createHttpError(400, 'Chapters can only be added to text books');
  }
  const directory = await assertBookDirectory(bookId);
  const rawText = typeof content === 'string' ? content.trim() : '';
  if (!rawText) {
    throw createHttpError(400, 'Chapter content is empty');
  }

  const numbers = await listChapterNumbers(bookId);
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  const chapterNumber = maxNumber + 1;
  const chapterIndex = chapterNumber - 1;
  const filename = formatChapterFilename(chapterNumber);
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, rawText, 'utf8');

  const fallbackTitle = `Chapter ${chapterNumber}`;
  const chapterTitle = extractChapterTitle(title || rawText, fallbackTitle);
  const existing = (await loadRawToc(bookId)).map(normalizeTocEntry).filter(Boolean);
  const withoutDuplicate = existing.filter((entry) => entry.page !== chapterIndex);
  const updated = [...withoutDuplicate, { title: chapterTitle, page: chapterIndex }].sort(
    (a, b) => a.page - b.page
  );
  await saveRawToc(bookId, updated);
  const existingMeta = (await loadBookMeta(bookId)) || { type: 'text' };
  await saveBookMeta(bookId, {
    ...existingMeta,
    type: 'text',
    updatedAt: new Date().toISOString()
  });

  return {
    chapterNumber,
    chapterIndex,
    chapterTitle,
    chapterFile: `/data/${bookId}/${filename}`,
    toc: updated
  };
}

export async function updateTextChapter(bookId, chapterNumber, content, title) {
  const bookType = await getBookType(bookId);
  if (bookType !== 'text') {
    throw createHttpError(400, 'Chapters can only be edited for text books');
  }
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const rawText = typeof content === 'string' ? content.trim() : '';
  if (!rawText) {
    throw createHttpError(400, 'Chapter content is empty');
  }

  const directory = await assertBookDirectory(bookId);
  const filename = formatChapterFilename(chapterNumber);
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, rawText, 'utf8');

  const chapterIndex = chapterNumber - 1;
  const existing = (await loadRawToc(bookId)).map(normalizeTocEntry).filter(Boolean);
  const currentEntry = existing.find((entry) => entry.page === chapterIndex);
  const fallbackTitle = `Chapter ${chapterNumber}`;
  const cleanedTitle = typeof title === 'string' ? title.trim() : '';
  const chapterTitle =
    cleanedTitle ||
    currentEntry?.title ||
    extractChapterTitle(rawText, fallbackTitle);
  const withoutDuplicate = existing.filter((entry) => entry.page !== chapterIndex);
  const updated = [...withoutDuplicate, { title: chapterTitle, page: chapterIndex }].sort(
    (a, b) => a.page - b.page
  );
  await saveRawToc(bookId, updated);

  const existingMeta = (await loadBookMeta(bookId)) || { type: 'text' };
  await saveBookMeta(bookId, {
    ...existingMeta,
    type: 'text',
    updatedAt: new Date().toISOString()
  });

  return {
    chapterNumber,
    chapterIndex,
    chapterTitle,
    chapterFile: `/data/${bookId}/${filename}`,
    toc: updated
  };
}
