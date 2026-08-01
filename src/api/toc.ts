import type { ChapterTextVersionModel, TocEntry } from '@/types/app';

export type TocApiVariant = 'main' | 'detailed';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function getTocQuery(variant: TocApiVariant, includeStats = true) {
  const params = new URLSearchParams();
  if (variant === 'detailed') {
    params.set('variant', 'detailed');
  }
  if (includeStats) {
    params.set('includeStats', '1');
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeTocEntries(entries: unknown): TocEntry[] {
  return Array.isArray(entries) ? entries as TocEntry[] : [];
}

export async function fetchToc(bookId: string, variant: TocApiVariant, includeStats = true) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/toc${getTocQuery(variant, includeStats)}`);
  const payload = await readJson<{ toc?: TocEntry[] }>(response);
  return normalizeTocEntries(payload.toc);
}

export async function fetchAllToc(bookId: string) {
  const [main, detailed] = await Promise.all([
    fetchToc(bookId, 'main', true),
    fetchToc(bookId, 'detailed', true)
  ]);
  return { main, detailed };
}

export async function generateToc(bookId: string, variant: TocApiVariant) {
  const params = new URLSearchParams({ variant });
  if (variant === 'detailed') {
    params.set('detailLevel', 'detailed');
  }
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/toc/generate?${params.toString()}`, {
    method: 'POST'
  });
  const payload = await readJson<{ toc?: TocEntry[] }>(response);
  return normalizeTocEntries(payload.toc);
}

export async function saveToc(input: {
  bookId: string;
  variant: TocApiVariant;
  toc: TocEntry[];
}) {
  const query = input.variant === 'detailed' ? '?variant=detailed' : '';
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/toc${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toc: input.toc })
  });
  const payload = await readJson<{ toc?: TocEntry[] }>(response);
  return normalizeTocEntries(payload.toc);
}

export async function generateChapterText(input: {
  bookId: string;
  pageStart: number;
  pageEnd: number;
  chapterNumber: number;
  model: ChapterTextVersionModel;
}) {
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/chapters/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      chapterNumber: input.chapterNumber,
      model: input.model
    })
  });
  return readJson<{ file: string }>(response);
}
