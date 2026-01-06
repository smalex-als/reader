import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR, IMAGE_EXTENSIONS } from '../config.js';
import { createHttpError } from './errors.js';
import { ensureDataDir, safeStat } from './fs.js';

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true
});

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

export async function deleteBook(bookId) {
  const directory = await assertBookDirectory(bookId);
  await fs.rm(directory, { recursive: true, force: true });
}
