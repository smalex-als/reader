import type { AppSettings } from '@/types/app';

const SETTINGS_KEY = 'scanned-reader:settings';
const BOOK_KEY = 'scanned-reader:lastBook';
const PAGE_KEY = 'scanned-reader:lastPage';
const STREAM_VOICE_KEY = 'scanned-reader:streamVoice';
const QUIZ_AUTOPLAY_KEY = 'scanned-reader:quizAutoplay';
const BOOK_META_KEY = 'scanned-reader:bookMeta';
const BOOK_SORT_MODE_KEY = 'scanned-reader:bookSortMode';

type StoredSettings = Record<string, AppSettings>;
type StoredBookMeta = Record<
  string,
  {
    lastOpenedAt?: string;
    deferred?: boolean;
  }
>;
type BookSortMode = 'alphabetical' | 'recent' | 'deferred';

export interface LibraryStateSnapshot {
  lastBook: string | null;
  lastPages: Record<string, number>;
  bookMeta: StoredBookMeta;
  bookSortMode: BookSortMode;
}

let libraryStateCache: LibraryStateSnapshot = {
  lastBook: null,
  lastPages: {},
  bookMeta: {},
  bookSortMode: 'recent'
};

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore persistence errors
  }
}

async function persistLibraryPatch(patch: {
  lastBook?: string | null;
  lastPages?: Record<string, number | null>;
  bookMeta?: Record<string, { lastOpenedAt?: string | null; deferred?: boolean | null } | null>;
  bookSortMode?: BookSortMode;
}) {
  try {
    await fetch('/api/library/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
  } catch (error) {
    console.error('Unable to persist library state', error);
  }
}

export async function loadLibraryStateFromServer(): Promise<LibraryStateSnapshot> {
  try {
    const response = await fetch('/api/library/state');
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as Partial<LibraryStateSnapshot>;
    const snapshot: LibraryStateSnapshot = {
      lastBook: typeof data.lastBook === 'string' && data.lastBook.trim() ? data.lastBook : null,
      lastPages: data.lastPages && typeof data.lastPages === 'object' ? data.lastPages : {},
      bookMeta: data.bookMeta && typeof data.bookMeta === 'object' ? data.bookMeta : {},
      bookSortMode:
        data.bookSortMode === 'recent' || data.bookSortMode === 'deferred'
          ? data.bookSortMode
          : 'recent'
    };
    libraryStateCache = snapshot;
    return snapshot;
  } catch (error) {
    console.error('Unable to load library state', error);
    return libraryStateCache;
  }
}

export function loadSettingsForBook(bookId: string): AppSettings | null {
  const settings = readJson<StoredSettings>(SETTINGS_KEY);
  if (!settings) {
    return null;
  }
  return settings[bookId] ?? null;
}

export function saveSettingsForBook(bookId: string, settings: AppSettings) {
  const stored = readJson<StoredSettings>(SETTINGS_KEY) ?? {};
  stored[bookId] = settings;
  writeJson(SETTINGS_KEY, stored);
}

export function loadLastBook(): string | null {
  return libraryStateCache.lastBook;
}

export function saveLastBook(bookId: string | null) {
  libraryStateCache = {
    ...libraryStateCache,
    lastBook: bookId && bookId.trim() ? bookId : null
  };
  void persistLibraryPatch({ lastBook: libraryStateCache.lastBook });
}

export function loadLastPage(bookId: string): number | null {
  const page = libraryStateCache.lastPages[bookId];
  return typeof page === 'number' ? page : null;
}

export function saveLastPage(bookId: string, pageIndex: number) {
  libraryStateCache = {
    ...libraryStateCache,
    lastPages: {
      ...libraryStateCache.lastPages,
      [bookId]: pageIndex
    }
  };
  void persistLibraryPatch({ lastPages: { [bookId]: pageIndex } });
}

export function loadStreamVoiceForBook(bookId: string): string | null {
  const voices = readJson<Record<string, string>>(STREAM_VOICE_KEY);
  if (!voices) {
    return null;
  }
  const voice = voices[bookId];
  return typeof voice === 'string' ? voice : null;
}

export function saveStreamVoiceForBook(bookId: string, voice: string) {
  const voices = readJson<Record<string, string>>(STREAM_VOICE_KEY) ?? {};
  voices[bookId] = voice;
  writeJson(STREAM_VOICE_KEY, voices);
}

export function loadQuizAutoplayForBook(bookId: string): boolean | null {
  const values = readJson<Record<string, boolean>>(QUIZ_AUTOPLAY_KEY);
  if (!values) {
    return null;
  }
  const value = values[bookId];
  return typeof value === 'boolean' ? value : null;
}

export function saveQuizAutoplayForBook(bookId: string, enabled: boolean) {
  const values = readJson<Record<string, boolean>>(QUIZ_AUTOPLAY_KEY) ?? {};
  values[bookId] = enabled;
  writeJson(QUIZ_AUTOPLAY_KEY, values);
}

export function loadBookMeta(): StoredBookMeta {
  return libraryStateCache.bookMeta;
}

export function markBookOpened(bookId: string) {
  const lastOpenedAt = new Date().toISOString();
  libraryStateCache = {
    ...libraryStateCache,
    bookMeta: {
      ...libraryStateCache.bookMeta,
      [bookId]: {
        ...libraryStateCache.bookMeta[bookId],
        lastOpenedAt
      }
    }
  };
  void persistLibraryPatch({ bookMeta: { [bookId]: { lastOpenedAt } } });
}

export function setBookDeferred(bookId: string, deferred: boolean) {
  libraryStateCache = {
    ...libraryStateCache,
    bookMeta: {
      ...libraryStateCache.bookMeta,
      [bookId]: {
        ...libraryStateCache.bookMeta[bookId],
        deferred
      }
    }
  };
  void persistLibraryPatch({ bookMeta: { [bookId]: { deferred } } });
}

export function removeBookStorage(bookId: string) {
  const settings = readJson<StoredSettings>(SETTINGS_KEY) ?? {};
  if (bookId in settings) {
    delete settings[bookId];
    writeJson(SETTINGS_KEY, settings);
  }

  const voices = readJson<Record<string, string>>(STREAM_VOICE_KEY) ?? {};
  if (bookId in voices) {
    delete voices[bookId];
    writeJson(STREAM_VOICE_KEY, voices);
  }

  const quizAutoplay = readJson<Record<string, boolean>>(QUIZ_AUTOPLAY_KEY) ?? {};
  if (bookId in quizAutoplay) {
    delete quizAutoplay[bookId];
    writeJson(QUIZ_AUTOPLAY_KEY, quizAutoplay);
  }

  const nextPages = { ...libraryStateCache.lastPages };
  delete nextPages[bookId];
  const nextMeta = { ...libraryStateCache.bookMeta };
  delete nextMeta[bookId];
  const removedLastBook = libraryStateCache.lastBook === bookId;
  libraryStateCache = {
    ...libraryStateCache,
    lastBook: removedLastBook ? null : libraryStateCache.lastBook,
    lastPages: nextPages,
    bookMeta: nextMeta
  };

  void persistLibraryPatch({
    lastBook: removedLastBook ? null : undefined,
    lastPages: { [bookId]: null },
    bookMeta: { [bookId]: null }
  });
}

export function loadBookSortMode(): BookSortMode {
  return libraryStateCache.bookSortMode;
}

export function saveBookSortMode(mode: BookSortMode) {
  libraryStateCache = {
    ...libraryStateCache,
    bookSortMode: mode
  };
  void persistLibraryPatch({ bookSortMode: mode });
}
