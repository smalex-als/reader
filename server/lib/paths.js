import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';

export function normalizeBookId(rawId) {
  const bookId = decodeURIComponent(rawId || '').trim();
  if (!bookId) {
    throw createHttpError(400, 'Book id required');
  }
  if (bookId.includes('..') || bookId.includes(path.sep)) {
    throw createHttpError(400, 'Invalid book id');
  }
  return bookId;
}

export function resolveDataUrl(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') {
    throw createHttpError(400, 'Image path required');
  }
  if (!urlPath.startsWith('/data/')) {
    throw createHttpError(400, 'Image path must start with /data/');
  }
  const relative = urlPath.slice('/data/'.length);
  const resolved = path.normalize(path.join(DATA_DIR, relative));
  if (!resolved.startsWith(DATA_DIR)) {
    throw createHttpError(400, 'Path escapes data directory');
  }
  return { relative, absolute: resolved };
}

export function deriveTextPathsFromImageUrl(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);
  return { textRelative, textAbsolute };
}

export function validateBookImage(bookId, imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(`/data/${bookId}/`)) {
    throw createHttpError(400, 'Image must belong to requested book');
  }
  return resolveDataUrl(imageUrl);
}
