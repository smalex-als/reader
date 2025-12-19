import path from 'node:path';
import fs from 'node:fs/promises';
import { BOOKMARKS_FILENAME, DATA_DIR } from '../config.js';
import { assertBookDirectory } from './books.js';
import { safeStat } from './fs.js';
import { resolveDataUrl } from './paths.js';

function deriveBookmarkLabel(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return 'Page';
  }
  const filename = imageUrl.split('/').pop() || imageUrl;
  return filename.replace(/\.[^.]+$/, '') || filename;
}

function sanitizeBookmark(raw, bookId) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const page = Number.parseInt(raw.page, 10);
  const image = typeof raw.image === 'string' ? raw.image : '';
  if (!Number.isInteger(page) || page < 0) {
    return null;
  }
  if (!image.startsWith(`/data/${bookId}/`)) {
    return null;
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : deriveBookmarkLabel(image);
  return {
    page,
    image,
    label: label || deriveBookmarkLabel(image)
  };
}

export async function loadBookmarks(bookId) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, BOOKMARKS_FILENAME);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    return [];
  }
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed = [];
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      parsed = json;
    }
  } catch {
    // ignore parse failures and fall back to empty list
  }
  return parsed
    .map((entry) => sanitizeBookmark(entry, bookId))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
}

export async function saveBookmarks(bookId, bookmarks) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, BOOKMARKS_FILENAME);
  const normalized = (Array.isArray(bookmarks) ? bookmarks : [])
    .map((entry) => sanitizeBookmark(entry, bookId))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export async function deriveBookmarkLabelFromText(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);
  const stat = await safeStat(textAbsolute);
  if (!stat?.isFile()) {
    return null;
  }
  try {
    const content = await fs.readFile(textAbsolute, 'utf8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
    return firstLine?.trim() || null;
  } catch {
    return null;
  }
}

export function sanitizeBookmarkInput(raw, bookId) {
  return sanitizeBookmark(raw, bookId);
}

export function deriveBookmarkLabelFromImage(imageUrl) {
  return deriveBookmarkLabel(imageUrl);
}
