import type { Bookmark } from '@/types/app';

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function readBookmarkResponse(response: Response) {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = (await response.json()) as { bookmarks?: Bookmark[] };
  return Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
}

export async function fetchBookBookmarks(bookId: string) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/bookmarks`);
  return readBookmarkResponse(response);
}

export async function saveBookBookmark(input: {
  bookId: string;
  page: number;
  image: string;
}) {
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      page: input.page,
      image: input.image
    })
  });
  return readBookmarkResponse(response);
}

export async function deleteBookBookmark(bookId: string, page: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/bookmarks?page=${encodeURIComponent(page)}`,
    { method: 'DELETE' }
  );
  return readBookmarkResponse(response);
}
