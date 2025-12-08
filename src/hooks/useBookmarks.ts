import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bookmark } from '@/types/app';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

interface UseBookmarksOptions {
  bookId: string | null;
  currentPage: number;
  currentImage: string | null;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  renderPage: (pageIndex: number) => void;
}

export function useBookmarks(options: UseBookmarksOptions) {
  const { bookId, currentPage, currentImage, renderPage, showToast } = options;
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);

  const fetchBookmarks = useCallback(
    async (targetBookId: string | null = bookId) => {
      if (!targetBookId) {
        setBookmarks([]);
        return;
      }
      setBookmarksLoading(true);
      try {
        const data = await fetchJson<{ book: string; bookmarks: Bookmark[] }>(
          `/api/books/${encodeURIComponent(targetBookId)}/bookmarks`
        );
        setBookmarks(data.bookmarks ?? []);
      } catch (error) {
        console.error(error);
        setBookmarks([]);
        showToast('Unable to load bookmarks', 'error');
      } finally {
        setBookmarksLoading(false);
      }
    },
    [bookId, showToast]
  );

  const addBookmark = useCallback(async () => {
    if (!bookId || !currentImage) {
      return;
    }
    try {
      setBookmarksLoading(true);
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: currentPage,
          image: currentImage
        })
      });
      if (!response.ok) {
        throw new Error('Failed to save bookmark');
      }
      const data = (await response.json()) as { bookmarks: Bookmark[] };
      setBookmarks(data.bookmarks ?? []);
      showToast('Bookmark saved', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to save bookmark', 'error');
    } finally {
      setBookmarksLoading(false);
    }
  }, [bookId, currentImage, currentPage, showToast]);

  const removeBookmark = useCallback(
    async (pageIndex?: number) => {
      if (!bookId) {
        return;
      }
      const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
      if (targetPage < 0) {
        return;
      }
      try {
        setBookmarksLoading(true);
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/bookmarks?page=${encodeURIComponent(targetPage)}`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          throw new Error('Failed to remove bookmark');
        }
        const data = (await response.json()) as { bookmarks: Bookmark[] };
        setBookmarks(data.bookmarks ?? []);
        showToast('Bookmark removed', 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to remove bookmark', 'error');
      } finally {
        setBookmarksLoading(false);
      }
    },
    [bookId, currentPage, showToast]
  );

  const toggleBookmark = useCallback(() => {
    const existing = bookmarks.some((entry) => entry.page === currentPage);
    if (existing) {
      void removeBookmark(currentPage);
    } else {
      void addBookmark();
    }
  }, [addBookmark, bookmarks, currentPage, removeBookmark]);

  const showBookmarks = useCallback(() => {
    setBookmarksOpen(true);
    if (bookmarks.length === 0) {
      void fetchBookmarks();
    }
  }, [bookmarks.length, fetchBookmarks]);

  const closeBookmarks = useCallback(() => {
    setBookmarksOpen(false);
  }, []);

  const handleSelectBookmark = useCallback(
    (bookmark: Bookmark) => {
      setBookmarksOpen(false);
      renderPage(bookmark.page);
    },
    [renderPage]
  );

  const handleRemoveBookmarkFromList = useCallback(
    (bookmark: Bookmark) => {
      void removeBookmark(bookmark.page);
    },
    [removeBookmark]
  );

  useEffect(() => {
    if (!bookId) {
      setBookmarks([]);
      setBookmarksOpen(false);
      return;
    }
    void fetchBookmarks(bookId);
  }, [bookId, fetchBookmarks]);

  const isBookmarked = useMemo(() => bookmarks.some((entry) => entry.page === currentPage), [
    bookmarks,
    currentPage
  ]);

  return {
    addBookmark,
    bookmarks,
    bookmarksLoading,
    bookmarksOpen,
    closeBookmarks,
    fetchBookmarks,
    handleRemoveBookmarkFromList,
    handleSelectBookmark,
    isBookmarked,
    removeBookmark,
    showBookmarks,
    toggleBookmark
  };
}
