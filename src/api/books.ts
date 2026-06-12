import type { BookCard, BookCardUpdate } from '@/types/app';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function createDefaultBookCard(bookId: string): BookCard {
  return {
    book: bookId,
    title: bookId,
    author: '',
    category: '',
    coverImage: null,
    defaultCoverImage: null,
    bookType: 'image'
  };
}

function normalizeBookCard(value: unknown, fallbackBookId?: string): BookCard | null {
  if (!isRecord(value)) {
    return fallbackBookId ? createDefaultBookCard(fallbackBookId) : null;
  }
  const book = typeof value.book === 'string' && value.book.trim() ? value.book : fallbackBookId;
  if (!book) {
    return null;
  }
  return {
    book,
    title: typeof value.title === 'string' && value.title.trim() ? value.title : book,
    author: typeof value.author === 'string' ? value.author : '',
    category: typeof value.category === 'string' ? value.category : '',
    coverImage: nullableString(value.coverImage),
    defaultCoverImage: nullableString(value.defaultCoverImage),
    bookType: value.bookType === 'text' ? 'text' : 'image'
  };
}

export async function fetchBookCards(): Promise<Record<string, BookCard>> {
  const response = await fetch('/api/books/cards');
  const payload = (await response.json().catch(() => ({}))) as { books?: unknown };
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const cards = Array.isArray(payload.books)
    ? payload.books.map((item) => normalizeBookCard(item)).filter((card): card is BookCard => Boolean(card))
    : [];
  return Object.fromEntries(cards.map((card) => [card.book, card]));
}

export async function fetchBookCard(bookId: string): Promise<BookCard> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/meta`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return normalizeBookCard(payload, bookId) ?? createDefaultBookCard(bookId);
}

export async function saveBookCard(bookId: string, card: BookCardUpdate): Promise<BookCard> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/meta`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return normalizeBookCard(payload, bookId) ?? {
    ...createDefaultBookCard(bookId),
    ...card,
    coverImage: card.coverImage || null
  };
}
