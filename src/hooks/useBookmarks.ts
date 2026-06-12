import { useCallback, useEffect, useMemo } from 'react';
import type { Bookmark } from '@/types/app';
import {
  deleteBookBookmark,
  fetchBookBookmarks,
  saveBookBookmark
} from '@/api/bookmarks';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  selectBookmarkWorkflow,
  selectBookManifest,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type BookmarkPayloads = {
  fetchBookmarks: {
    bookId: string | null;
  };
  addBookmark: {
    bookId: string | null;
    page: number;
    image: string | null;
  };
  removeBookmark: {
    bookId: string | null;
    page: number;
  };
};

type BookmarkActions = {
  resetBookmarks: () => void;
  setBookmarks: (items: Bookmark[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const bookmarkHandlers = createActionHandlerRegistry<
  unknown,
  BookmarkActions,
  BookmarkPayloads
>();
const { addActionHandler } = bookmarkHandlers;

addActionHandler('fetchBookmarks', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    actions.resetBookmarks();
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setLoadError,
    fallbackError: 'Unable to load bookmarks',
    request: () => fetchBookBookmarks(payload.bookId!),
    onSuccess: actions.setBookmarks,
    onError: (error) => {
      console.error(error);
      actions.setBookmarks([]);
      actions.showError('Unable to load bookmarks');
    }
  });
});

addActionHandler('addBookmark', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId || !payload.image) {
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setLoadError,
    fallbackError: 'Unable to save bookmark',
    request: () =>
      saveBookBookmark({
        bookId: payload.bookId!,
        page: payload.page,
        image: payload.image!
      }),
    onSuccess: (bookmarks) => {
      actions.setBookmarks(bookmarks);
      actions.showSuccess('Bookmark saved');
    },
    onError: (error) => {
      console.error(error);
      actions.showError('Unable to save bookmark');
    }
  });
});

addActionHandler('removeBookmark', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId || payload.page < 0) {
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setLoadError,
    fallbackError: 'Unable to remove bookmark',
    request: () => deleteBookBookmark(payload.bookId!, payload.page),
    onSuccess: (bookmarks) => {
      actions.setBookmarks(bookmarks);
      actions.showSuccess('Bookmark removed');
    },
    onError: (error) => {
      console.error(error);
      actions.showError('Unable to remove bookmark');
    }
  });
});

function useBookmarkActions() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const actions = useMemo<BookmarkActions>(
    () => ({
      resetBookmarks: () => dispatch(appActions.resetBookmarks()),
      setBookmarks: (items) => dispatch(appActions.setBookmarks(items)),
      setLoading: (loading) => dispatch(appActions.setBookmarksLoading(loading)),
      setLoadError: () => undefined,
      showError: (message) => showToast(message, 'error'),
      showSuccess: (message) => showToast(message, 'success')
    }),
    [dispatch, showToast]
  );

  return useCallback(
    async <T extends keyof BookmarkPayloads>(action: T, payload: BookmarkPayloads[T]) => {
      await bookmarkHandlers.runAction(action, undefined, actions, payload);
    },
    [actions]
  );
}

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
  const manifest = useAppSelector(selectBookManifest);
  const runBookmarkAction = useBookmarkActions();
  const currentImage = manifest[currentPage] ?? null;

  return useCallback(async () => {
    await runBookmarkAction('addBookmark', {
      bookId,
      page: currentPage,
      image: currentImage
    });
  }, [bookId, currentImage, currentPage, runBookmarkAction]);
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
  const dispatch = useAppDispatch();
  const runBookmarkAction = useBookmarkActions();

  return useCallback(
    async (targetBookId: string | null = bookId) => {
      if (!targetBookId) {
        dispatch(appActions.resetBookmarks());
        return;
      }
      await runBookmarkAction('fetchBookmarks', {
        bookId: targetBookId
      });
    },
    [bookId, dispatch, runBookmarkAction]
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
  const runBookmarkAction = useBookmarkActions();

  return useCallback(
    async (pageIndex?: number) => {
      const targetPage = typeof pageIndex === 'number' ? pageIndex : currentPage;
      await runBookmarkAction('removeBookmark', {
        bookId,
        page: targetPage
      });
    },
    [bookId, currentPage, runBookmarkAction]
  );
}
