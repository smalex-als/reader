import type { AppSettings } from '@/types/app';

const SETTINGS_KEY = 'scanned-reader:settings';
const BOOK_KEY = 'scanned-reader:lastBook';
const PAGE_KEY = 'scanned-reader:lastPage';
const STREAM_VOICE_KEY = 'scanned-reader:streamVoice';
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
  return readJson<string>(BOOK_KEY);
}

export function saveLastBook(bookId: string | null) {
  if (!bookId) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(BOOK_KEY);
    }
    return;
  }
  writeJson(BOOK_KEY, bookId);
}

export function loadLastPage(bookId: string): number | null {
  const pages = readJson<Record<string, number>>(PAGE_KEY);
  if (!pages) {
    return null;
  }
  const page = pages[bookId];
  return typeof page === 'number' ? page : null;
}

export function saveLastPage(bookId: string, pageIndex: number) {
  const pages = readJson<Record<string, number>>(PAGE_KEY) ?? {};
  pages[bookId] = pageIndex;
  writeJson(PAGE_KEY, pages);
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

export function loadBookMeta(): StoredBookMeta {
  return readJson<StoredBookMeta>(BOOK_META_KEY) ?? {};
}

export function markBookOpened(bookId: string) {
  const meta = loadBookMeta();
  meta[bookId] = {
    ...meta[bookId],
    lastOpenedAt: new Date().toISOString()
  };
  writeJson(BOOK_META_KEY, meta);
}

export function setBookDeferred(bookId: string, deferred: boolean) {
  const meta = loadBookMeta();
  meta[bookId] = {
    ...meta[bookId],
    deferred
  };
  writeJson(BOOK_META_KEY, meta);
}

export function removeBookStorage(bookId: string) {
  const pages = readJson<Record<string, number>>(PAGE_KEY) ?? {};
  if (bookId in pages) {
    delete pages[bookId];
    writeJson(PAGE_KEY, pages);
  }

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

  const meta = loadBookMeta();
  if (bookId in meta) {
    delete meta[bookId];
    writeJson(BOOK_META_KEY, meta);
  }

  if (loadLastBook() === bookId && typeof window !== 'undefined') {
    window.localStorage.removeItem(BOOK_KEY);
  }
}

export function loadBookSortMode(): 'alphabetical' | 'recent' | 'deferred' {
  const value = readJson<string>(BOOK_SORT_MODE_KEY);
  if (value === 'recent' || value === 'deferred') {
    return value;
  }
  return 'alphabetical';
}

export function saveBookSortMode(mode: 'alphabetical' | 'recent' | 'deferred') {
  writeJson(BOOK_SORT_MODE_KEY, mode);
}
