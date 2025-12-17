import type { AppSettings } from '@/types/app';

const SETTINGS_KEY = 'scanned-reader:settings';
const BOOK_KEY = 'scanned-reader:lastBook';
const PAGE_KEY = 'scanned-reader:lastPage';
const STREAM_VOICE_KEY = 'scanned-reader:streamVoice';

type StoredSettings = Record<string, AppSettings>;

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
