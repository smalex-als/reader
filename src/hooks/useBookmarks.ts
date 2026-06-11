import { useCallback, useEffect } from 'react';
import type { Bookmark } from '@/types/app';
import { fetchJson } from '@/lib/fetchJson';
import { useToast } from '@/hooks/useToast';
import {
  appActions,
  selectBookmarkWorkflow,
  selectBookSessionWorkflow,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useBookmarks() {
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const fetchBookmarks = useFetchBookmarks();
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();

  const closeBookmarks = useCallback(() => {
    dispatch(appActions.closeModal('bookmarks'));
  }, [dispatch]);

  useEffect(() => {
    if (!bookId) {
      dispatch(appActions.resetBookmarks());
      dispatch(appActions.closeModal('bookmarks'));
      return;
    }
    void fetchBookmarks(bookId);
  }, [bookId, dispatch, fetchBookmarks]);

  return {
    addBookmark,
    closeBookmarks,
    fetchBookmarks,
    removeBookmark
  };
}

export function useAddBookmark() {
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const { manifest } = useAppSelector(selectBookSessionWorkflow);
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const currentImage = manifest[currentPage] ?? null;

  return useCallback(async () => {
    if (!bookId || !currentImage) {
      return;
    }
    try {
      dispatch(appActions.setBookmarksLoading(true));
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
      dispatch(appActions.setBookmarks(data.bookmarks ?? []));
      showToast('Bookmark saved', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to save bookmark', 'error');
    } finally {
      dispatch(appActions.setBookmarksLoading(false));
    }
  }, [bookId, currentImage, currentPage, dispatch, showToast]);
}

export function useToggleBookmark() {
  const { currentPage } = useAppSelector(selectReaderSession);
  const { items: bookmarks } = useAppSelector(selectBookmarkWorkflow);
  const addBookmark = useAddBookmark();
  const removeBookmark = useRemoveBookmark();

  return useCallback(() => {
    const existing = bookmarks.some((entry) => entry.page === currentPage);
    if (existing) {
      void removeBookmark(currentPage);
    } else {
      void addBookmark();
    }
  }, [addBookmark, bookmarks, currentPage, removeBookmark]);
}

export function useFetchBookmarks() {
  const { bookId } = useAppSelector(selectReaderSession);
  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  return useCallback(
    async (targetBookId: string | null = bookId) => {
      if (!targetBookId) {
        dispatch(appActions.resetBookmarks());
        return;
      }
      dispatch(appActions.setBookmarksLoading(true));
      try {
        const data = await fetchJson<{ book: string; bookmarks: Bookmark[] }>(
          `/api/books/${encodeURIComponent(targetBookId)}/bookmarks`
        );
        dispatch(appActions.setBookmarks(data.bookmarks ?? []));
      } catch (error) {
        console.error(error);
        dispatch(appActions.setBookmarks([]));
        showToast('Unable to load bookmarks', 'error');
      } finally {
        dispatch(appActions.setBookmarksLoading(false));
      }
    },
    [bookId, dispatch, showToast]
  );
}

export function useShowBookmarks() {
  const dispatch = useAppDispatch();
  const { items: bookmarks } = useAppSelector(selectBookmarkWorkflow);
  const fetchBookmarks = useFetchBookmarks();

  return useCallback(() => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('bookmarks'));
    if (bookmarks.length === 0) {
      void fetchBookmarks();
    }
  }, [bookmarks.length, dispatch, fetchBookmarks]);
}

export function useRemoveBookmark() {
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const { showToast } = useToast();
  const dispatch = useAppDispatch();

  return useCallback(
    async (pageIndex?: number) => {
      if (!bookId) {
        return;
      }
      const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
      if (targetPage < 0) {
        return;
      }
      try {
        dispatch(appActions.setBookmarksLoading(true));
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/bookmarks?page=${encodeURIComponent(targetPage)}`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          throw new Error('Failed to remove bookmark');
        }
        const data = (await response.json()) as { bookmarks: Bookmark[] };
        dispatch(appActions.setBookmarks(data.bookmarks ?? []));
        showToast('Bookmark removed', 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to remove bookmark', 'error');
      } finally {
        dispatch(appActions.setBookmarksLoading(false));
      }
    },
    [bookId, currentPage, dispatch, showToast]
  );
}
