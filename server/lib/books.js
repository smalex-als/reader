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

export async function getBookType(bookId) {
  const meta = await loadBookMeta(bookId);
  return meta?.type === 'text' ? 'text' : 'image';
}

export async function deleteBook(bookId) {
  const directory = await assertBookDirectory(bookId);
  await fs.rm(directory, { recursive: true, force: true });
}
