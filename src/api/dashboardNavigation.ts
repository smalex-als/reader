import { fetchToc } from '@/api/toc';

async function fetchBookManifest(bookId: string) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/manifest`);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { manifest?: string[] };
  return Array.isArray(payload.manifest) ? payload.manifest : [];
}

export async function resolveDashboardChapterPage(input: {
  bookId: string;
  chapterNumber: number;
  pageNumber?: number | null;
}) {
  const fallbackPage = input.chapterNumber - 1;
  const [manifestEntries, tocEntries] = await Promise.all([
    fetchBookManifest(input.bookId),
    fetchToc(input.bookId, 'main', false)
  ]);
  const normalizedPageNumber = Number.isInteger(input.pageNumber) ? Number(input.pageNumber) : null;
  if (
    normalizedPageNumber !== null &&
    normalizedPageNumber >= 0 &&
    normalizedPageNumber < manifestEntries.length
  ) {
    return normalizedPageNumber;
  }
  const tocEntry = tocEntries[input.chapterNumber - 1];
  if (tocEntry && Number.isInteger(tocEntry.page)) {
    return tocEntry.page;
  }
  return fallbackPage;
}
