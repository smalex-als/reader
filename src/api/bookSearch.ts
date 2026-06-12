import type { BookSearchResponse, SearchResult } from '@/types/app';

export async function searchBook(input: {
  bookId: string;
  query: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    q: input.query,
    limit: String(input.limit ?? 25)
  });
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  const payload = (await response.json()) as BookSearchResponse;
  return Array.isArray(payload.results) ? payload.results : [] as SearchResult[];
}
