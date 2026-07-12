import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  appActions,
  selectBookCardWorkflow,
  selectBookIds,
  selectRefreshTokens,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadBookMeta,
  loadBookSortMode,
  loadLibraryStateFromServer,
  saveBookSortMode,
  setBookDeferred,
  type BookSortMode
} from '@/lib/storage';

export type BookFeedItem = {
  active: boolean;
  author: string;
  bookType: 'image' | 'text';
  category: string;
  coverImage: string | null;
  id: string;
  lastOpenedLabel: string;
  saved: boolean;
  title: string;
};

function formatLastOpened(value?: string) {
  if (!value) {
    return 'Never opened';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Never opened';
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function useBookLibraryFeed({
  currentBook,
  open
}: {
  currentBook: string | null;
  open: boolean;
}) {
  const dispatch = useAppDispatch();
  const books = useAppSelector(selectBookIds);
  const { bookCards: cardRefreshToken } = useAppSelector(selectRefreshTokens);
  const {
    cardsByBook: bookCards,
    cardsLoading,
    cardsError
  } = useAppSelector(selectBookCardWorkflow);
  const [sortMode, setSortMode] = useState<BookSortMode>(() => loadBookSortMode());
  const [bookMeta, setBookMeta] = useState(() => loadBookMeta());

  useEffect(() => {
    if (!open) {
      return;
    }
    setBookMeta(loadBookMeta());
    setSortMode(loadBookSortMode());
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void loadLibraryStateFromServer().then((state) => {
      if (!cancelled) {
        setBookMeta(state.bookMeta);
        setSortMode(state.bookSortMode);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      dispatch(appActions.loadBookCards());
    }
  }, [books, cardRefreshToken, dispatch, open]);

  useEffect(() => {
    saveBookSortMode(sortMode);
  }, [sortMode]);

  const items = useMemo(() => {
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    const sortedBooks = [...books].sort((left, right) => {
      const leftMeta = bookMeta[left] ?? {};
      const rightMeta = bookMeta[right] ?? {};
      if (sortMode === 'recent') {
        const leftTime = leftMeta.lastOpenedAt ? new Date(leftMeta.lastOpenedAt).getTime() : 0;
        const rightTime = rightMeta.lastOpenedAt ? new Date(rightMeta.lastOpenedAt).getTime() : 0;
        return rightTime !== leftTime ? rightTime - leftTime : collator.compare(left, right);
      }
      if (sortMode === 'deferred') {
        const leftSaved = Boolean(leftMeta.deferred);
        const rightSaved = Boolean(rightMeta.deferred);
        if (leftSaved !== rightSaved) {
          return leftSaved ? -1 : 1;
        }
      }
      return collator.compare(left, right);
    });

    return sortedBooks.map((book): BookFeedItem => {
      const meta = bookMeta[book] ?? {};
      const card = bookCards[book];
      return {
        active: currentBook === book,
        author: card?.author?.trim() || '',
        bookType: card?.bookType ?? 'image',
        category: card?.category?.trim() || '',
        coverImage: card?.coverImage ?? null,
        id: book,
        lastOpenedLabel: formatLastOpened(meta.lastOpenedAt),
        saved: Boolean(meta.deferred),
        title: card?.title?.trim() || book
      };
    });
  }, [bookCards, bookMeta, books, currentBook, sortMode]);

  const toggleSaved = useCallback((book: string) => {
    const saved = !Boolean(bookMeta[book]?.deferred);
    setBookDeferred(book, saved);
    setBookMeta((previous) => ({
      ...previous,
      [book]: {
        ...previous[book],
        deferred: saved
      }
    }));
  }, [bookMeta]);

  return {
    cardsError,
    cardsLoading,
    items,
    setSortMode,
    sortMode,
    toggleSaved,
    totalBooks: books.length
  };
}
