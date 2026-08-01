import type { TocEntry } from '@/types/app';
import type { YouTubeTranscriptionModel } from '@/api/youtubeAudioImport';

export type BookManifestResult = {
  book: string;
  manifest: string[];
  bookType: 'image' | 'text';
  chapterCount: number;
  chapterFileCount: number;
};

export type TextChapterMutationResult = {
  book: string;
  bookType: 'text';
  chapterIndex: number | null;
  chapterCount: number;
  chapterFileCount: number;
  toc: TocEntry[];
  chapterNumber?: number;
  sourceAudioJob?: {
    jobId: string;
    source: 'youtube';
    sourceUrl: string;
    transcriptionModel?: YouTubeTranscriptionModel;
    status: 'queued' | 'running' | 'completed' | 'failed';
    error?: string | null;
    audioUrl?: string | null;
    postProcessPromptId?: string | null;
    postProcessPromptName?: string | null;
  } | null;
};

export type CreateChapterSource = 'blank' | 'youtube';

export type DeleteBookResult = {
  book: string;
  books: string[];
};

export type UploadPdfResult = {
  book: string;
  manifest: string[];
};

async function readApiError(response: Response, label: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `${label}: ${response.status}`;
  } catch {
    return `${label}: ${response.status}`;
  }
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(await readApiError(response, label));
  }
  return (await response.json()) as T;
}

function normalizeBookList(value: unknown) {
  return Array.isArray(value) ? value.filter((book): book is string => typeof book === 'string') : [];
}

function normalizeToc(value: unknown) {
  return Array.isArray(value) ? (value as TocEntry[]) : [];
}

function normalizeInteger(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function normalizeChapterMutation(payload: {
  book: string;
  bookType?: 'text';
  chapterIndex?: number;
  chapterCount?: number;
  chapterFileCount?: number;
  toc?: TocEntry[];
  chapterNumber?: number;
  sourceAudioJob?: TextChapterMutationResult['sourceAudioJob'];
}): TextChapterMutationResult {
  return {
    book: payload.book,
    bookType: 'text',
    chapterIndex: normalizeInteger(payload.chapterIndex, -1) >= 0 ? normalizeInteger(payload.chapterIndex) : null,
    chapterCount: normalizeInteger(payload.chapterCount),
    chapterFileCount: normalizeInteger(payload.chapterFileCount, normalizeInteger(payload.chapterCount)),
    toc: normalizeToc(payload.toc),
    chapterNumber: normalizeInteger(payload.chapterNumber, 0) > 0 ? normalizeInteger(payload.chapterNumber) : undefined,
    sourceAudioJob: payload.sourceAudioJob ?? null
  };
}

export async function fetchBookIds() {
  const response = await fetch('/api/books');
  const payload = await readJson<{ books?: unknown }>(response, 'Unable to load books');
  return normalizeBookList(payload.books);
}

export async function fetchBookManifest(bookId: string): Promise<BookManifestResult> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/manifest`);
  const payload = await readJson<{
    book: string;
    manifest?: unknown;
    bookType?: 'image' | 'text';
    chapterCount?: number;
    chapterFileCount?: number;
  }>(response, 'Unable to load book manifest');

  const chapterCount = normalizeInteger(payload.chapterCount);
  return {
    book: payload.book,
    manifest: normalizeBookList(payload.manifest),
    bookType: payload.bookType === 'text' ? 'text' : 'image',
    chapterCount,
    chapterFileCount: normalizeInteger(payload.chapterFileCount, chapterCount)
  };
}

export async function createEmptyTextChapter(input: {
  bookName: string;
  chapterTitle: string;
  targetBookId: string;
  isExisting: boolean;
  source: CreateChapterSource;
  sourceUrl: string;
  transcriptionModel: YouTubeTranscriptionModel;
  postProcessPromptId: string;
}) {
  const response = input.isExisting
    ? await fetch(`/api/books/${encodeURIComponent(input.targetBookId)}/chapters/empty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterTitle: input.chapterTitle,
          source: input.source,
          sourceUrl: input.sourceUrl,
          transcriptionModel: input.transcriptionModel,
          postProcessPromptId: input.postProcessPromptId
        })
      })
    : await fetch('/api/books/text/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookName: input.bookName,
          chapterTitle: input.chapterTitle,
          source: input.source,
          sourceUrl: input.sourceUrl,
          transcriptionModel: input.transcriptionModel,
          postProcessPromptId: input.postProcessPromptId
        })
      });
  const payload = await readJson<{
    book: string;
    bookType?: 'text';
    chapterIndex?: number;
    chapterCount?: number;
    chapterFileCount?: number;
    toc?: TocEntry[];
    sourceAudioJob?: TextChapterMutationResult['sourceAudioJob'];
  }>(response, 'Create failed');
  return normalizeChapterMutation(payload);
}

export async function deleteTextChapter(bookId: string, chapterNumber: number) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}`, {
    method: 'DELETE'
  });
  const payload = await readJson<{
    book: string;
    bookType?: 'text';
    chapterNumber: number;
    chapterIndex: number;
    chapterCount?: number;
    chapterFileCount?: number;
    toc?: TocEntry[];
  }>(response, 'Unable to delete chapter');
  return normalizeChapterMutation(payload);
}

export async function deleteBook(targetBookId: string) {
  const response = await fetch(`/api/books/${encodeURIComponent(targetBookId)}`, { method: 'DELETE' });
  const payload = await readJson<{ book: string; books?: unknown }>(response, 'Unable to delete book');
  return {
    book: payload.book,
    books: normalizeBookList(payload.books)
  };
}

export async function uploadPdfBook(file: File): Promise<UploadPdfResult> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/upload/pdf', { method: 'POST', body: formData });
  const payload = await readJson<{ book: string; manifest?: unknown }>(response, 'Upload failed');
  return {
    book: payload.book,
    manifest: normalizeBookList(payload.manifest)
  };
}

export async function uploadTextChapter(input: {
  file: File;
  bookName: string;
  chapterTitle: string;
  targetBookId: string;
  isExisting: boolean;
}) {
  const formData = new FormData();
  if (input.chapterTitle) {
    formData.append('chapterTitle', input.chapterTitle);
  }
  formData.append('file', input.file);

  const response = input.isExisting
    ? await fetch(`/api/books/${encodeURIComponent(input.targetBookId)}/chapters`, {
        method: 'POST',
        body: formData
      })
    : await (async () => {
        formData.append('bookName', input.bookName);
        return fetch('/api/books/text', { method: 'POST', body: formData });
      })();

  const payload = await readJson<{
    book: string;
    bookType?: 'text';
    chapterIndex?: number;
    chapterCount?: number;
    chapterFileCount?: number;
    toc?: TocEntry[];
  }>(response, 'Upload failed');
  return normalizeChapterMutation(payload);
}
