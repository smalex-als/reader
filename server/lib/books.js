import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR, IMAGE_EXTENSIONS } from '../config.js';
import { createHttpError } from './errors.js';
import { ensureDataDir, safeStat } from './fs.js';

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true
});
const BOOK_META_FILENAME = 'book.json';
const BOOK_META_TEXT_LIMIT = 160;
const BOOK_META_CATEGORY_LIMIT = 80;

export function getBookDirectory(bookId) {
  return path.join(DATA_DIR, bookId);
}

export async function assertBookDirectory(bookId) {
  const directory = getBookDirectory(bookId);
  const stat = await safeStat(directory);
  if (!stat?.isDirectory()) {
    throw createHttpError(404, 'Book not found');
  }
  return directory;
}

export async function listBooks() {
  ensureDataDir();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => collator.compare(a, b));
}

export async function loadManifest(bookId) {
  const directory = await assertBookDirectory(bookId);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const manifest = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => collator.compare(a, b))
    .map((filename) => `/data/${bookId}/${filename}`);

  if (manifest.length === 0) {
    throw createHttpError(404, 'No images found for book');
  }

  return manifest;
}

export async function loadBookMeta(bookId) {
  const directory = await assertBookDirectory(bookId);
  const metaPath = path.join(directory, BOOK_META_FILENAME);
  const stat = await safeStat(metaPath);
  if (!stat?.isFile()) {
    return null;
  }
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveBookMeta(bookId, meta) {
  const directory = await assertBookDirectory(bookId);
  const metaPath = path.join(directory, BOOK_META_FILENAME);
  await fs.writeFile(metaPath, JSON.stringify(meta ?? {}, null, 2), 'utf8');
  return meta ?? {};
}

function sanitizeMetaText(value, maxLength = BOOK_META_TEXT_LIMIT) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, maxLength);
}

function sanitizeCoverImage(bookId, value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.startsWith(`/data/${bookId}/`) ? trimmed : null;
}

async function getDefaultCoverImage(bookId, bookType) {
  if (bookType !== 'image') {
    return null;
  }
  try {
    const manifest = await loadManifest(bookId);
    return manifest[0] ?? null;
  } catch {
    return null;
  }
}

export async function loadBookCard(bookId) {
  const meta = (await loadBookMeta(bookId)) || {};
  const bookType = meta?.type === 'text' ? 'text' : 'image';
  const defaultCoverImage = await getDefaultCoverImage(bookId, bookType);
  return {
    book: bookId,
    title: sanitizeMetaText(meta?.title) || bookId,
    author: sanitizeMetaText(meta?.author),
    category: sanitizeMetaText(meta?.category, BOOK_META_CATEGORY_LIMIT),
    coverImage: sanitizeCoverImage(bookId, meta?.coverImage) ?? defaultCoverImage,
    defaultCoverImage,
    bookType
  };
}

export async function listBookCards() {
  const books = await listBooks();
  return Promise.all(books.map((bookId) => loadBookCard(bookId)));
}

export async function updateBookCard(bookId, updates) {
  const current = (await loadBookMeta(bookId)) || {};
  const bookType = current?.type === 'text' ? 'text' : 'image';
  const nextMeta = {
    ...current,
    title: sanitizeMetaText(updates?.title),
    author: sanitizeMetaText(updates?.author),
    category: sanitizeMetaText(updates?.category, BOOK_META_CATEGORY_LIMIT),
    updatedAt: new Date().toISOString()
  };

  const nextCoverImage = sanitizeCoverImage(bookId, updates?.coverImage);
  if (nextCoverImage) {
    nextMeta.coverImage = nextCoverImage;
  } else {
    delete nextMeta.coverImage;
  }

  await saveBookMeta(bookId, nextMeta);
  return loadBookCard(bookId, bookType);
}

export async function getBookType(bookId) {
  const meta = await loadBookMeta(bookId);
  return meta?.type === 'text' ? 'text' : 'image';
}

export async function deleteBook(bookId) {
  const directory = await assertBookDirectory(bookId);
  await fs.rm(directory, { recursive: true, force: true });
}
