import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR } from '../config.js';

const LIBRARY_STATE_PATH = path.join(DATA_DIR, '.library-state.json');
const DEFAULT_LIBRARY_STATE = {
  lastBook: null,
  lastPages: {},
  bookMeta: {},
  bookSortMode: 'recent'
};

function sanitizePageMap(value) {
  const result = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (const [bookId, page] of Object.entries(value)) {
    if (typeof bookId !== 'string' || !Number.isInteger(page) || page < 0) {
      continue;
    }
    result[bookId] = page;
  }
  return result;
}

function sanitizeBookMeta(value) {
  const result = {};
  if (!value || typeof value !== 'object') {
    return result;
  }
  for (const [bookId, meta] of Object.entries(value)) {
    if (typeof bookId !== 'string' || !meta || typeof meta !== 'object') {
      continue;
    }
    const nextMeta = {};
    if (typeof meta.lastOpenedAt === 'string' && meta.lastOpenedAt.trim()) {
      nextMeta.lastOpenedAt = meta.lastOpenedAt;
    }
    if (typeof meta.deferred === 'boolean') {
      nextMeta.deferred = meta.deferred;
    }
    if (Object.keys(nextMeta).length > 0) {
      result[bookId] = nextMeta;
    }
  }
  return result;
}

function normalizeLibraryState(value) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    lastBook: typeof state.lastBook === 'string' && state.lastBook.trim() ? state.lastBook : null,
    lastPages: sanitizePageMap(state.lastPages),
    bookMeta: sanitizeBookMeta(state.bookMeta),
    bookSortMode:
      state.bookSortMode === 'recent' || state.bookSortMode === 'deferred'
        ? state.bookSortMode
        : 'recent'
  };
}

async function writeLibraryState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LIBRARY_STATE_PATH, JSON.stringify(state, null, 2));
}

export async function loadLibraryState() {
  try {
    const raw = await fs.readFile(LIBRARY_STATE_PATH, 'utf8');
    return { ...DEFAULT_LIBRARY_STATE, ...normalizeLibraryState(JSON.parse(raw)) };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ...DEFAULT_LIBRARY_STATE };
    }
    throw error;
  }
}

export async function updateLibraryState(patch) {
  const current = await loadLibraryState();
  const next = {
    ...current,
    lastPages: { ...current.lastPages },
    bookMeta: { ...current.bookMeta }
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'lastBook')) {
    next.lastBook =
      typeof patch.lastBook === 'string' && patch.lastBook.trim() ? patch.lastBook : null;
  }

  if (patch.bookSortMode === 'alphabetical' || patch.bookSortMode === 'recent' || patch.bookSortMode === 'deferred') {
    next.bookSortMode = patch.bookSortMode;
  }

  if (patch.lastPages && typeof patch.lastPages === 'object') {
    for (const [bookId, page] of Object.entries(patch.lastPages)) {
      if (page === null) {
        delete next.lastPages[bookId];
        continue;
      }
      if (Number.isInteger(page) && page >= 0) {
        next.lastPages[bookId] = page;
      }
    }
  }

  if (patch.bookMeta && typeof patch.bookMeta === 'object') {
    for (const [bookId, metaPatch] of Object.entries(patch.bookMeta)) {
      if (metaPatch === null) {
        delete next.bookMeta[bookId];
        continue;
      }
      if (!metaPatch || typeof metaPatch !== 'object') {
        continue;
      }
      const currentMeta = { ...(next.bookMeta[bookId] ?? {}) };
      if (Object.prototype.hasOwnProperty.call(metaPatch, 'lastOpenedAt')) {
        if (typeof metaPatch.lastOpenedAt === 'string' && metaPatch.lastOpenedAt.trim()) {
          currentMeta.lastOpenedAt = metaPatch.lastOpenedAt;
        } else {
          delete currentMeta.lastOpenedAt;
        }
      }
      if (Object.prototype.hasOwnProperty.call(metaPatch, 'deferred')) {
        if (typeof metaPatch.deferred === 'boolean') {
          currentMeta.deferred = metaPatch.deferred;
        } else {
          delete currentMeta.deferred;
        }
      }
      if (Object.keys(currentMeta).length === 0) {
        delete next.bookMeta[bookId];
      } else {
        next.bookMeta[bookId] = currentMeta;
      }
    }
  }

  await writeLibraryState(next);
  return next;
}
