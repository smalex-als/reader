export type BookSortMode = 'alphabetical' | 'recent' | 'deferred';

export type StoredBookMeta = Record<
  string,
  {
    lastOpenedAt?: string;
    deferred?: boolean;
  }
>;

export interface LibraryStateSnapshot {
  lastBook: string | null;
  lastPages: Record<string, number>;
  bookMeta: StoredBookMeta;
  bookSortMode: BookSortMode;
}

export type LibraryStatePatch = {
  lastBook?: string | null;
  lastPages?: Record<string, number | null>;
  bookMeta?: Record<string, { lastOpenedAt?: string | null; deferred?: boolean | null } | null>;
  bookSortMode?: BookSortMode;
};

export async function saveLibraryStatePatch(patch: LibraryStatePatch) {
  const response = await fetch('/api/library/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export async function fetchLibraryState(): Promise<LibraryStateSnapshot> {
  const response = await fetch('/api/library/state');
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as Partial<LibraryStateSnapshot>;
  return {
    lastBook: typeof data.lastBook === 'string' && data.lastBook.trim() ? data.lastBook : null,
    lastPages: data.lastPages && typeof data.lastPages === 'object' ? data.lastPages : {},
    bookMeta: data.bookMeta && typeof data.bookMeta === 'object' ? data.bookMeta : {},
    bookSortMode:
      data.bookSortMode === 'recent' || data.bookSortMode === 'deferred' || data.bookSortMode === 'alphabetical'
        ? data.bookSortMode
        : 'recent'
  };
}
