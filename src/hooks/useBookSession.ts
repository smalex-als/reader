import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  bookSessionHandlers,
  createBookSessionActions,
  type BookSessionActions
} from '@/hooks/bookSessionActions';
import type { ViewMode } from '@/lib/appConstants';
import {
  getBookFromLocation,
  getPageFromLocation,
  getViewModeFromLocation
} from '@/lib/bookUrl';
import { useToast } from '@/hooks/useToast';
import { clamp } from '@/lib/math';
import {
  appActions,
  selectBookIds,
  selectBookLibraryStateReady,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadLastPage,
  loadLibraryStateFromServer,
  saveLastBook
} from '@/lib/storage';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useBookSession() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId } = useAppSelector(selectReaderSession);
  const books = useAppSelector(selectBookIds);
  const libraryStateReady = useAppSelector(selectBookLibraryStateReady);
  const pendingPageRef = useRef<number | null>(null);

  const setBooks: Dispatch<SetStateAction<string[]>> = useCallback(
    (next) => {
      dispatch(appActions.setBookSessionBooks(resolveNext(next, books)));
    },
    [books, dispatch]
  );

  const setManifest = useCallback((nextManifest: string[]) => {
    dispatch(appActions.setBookSessionManifest(nextManifest));
  }, [dispatch]);

  const setBookType = useCallback((nextBookType: 'image' | 'text') => {
    dispatch(appActions.setBookSessionBookType(nextBookType));
  }, [dispatch]);

  const setChapterCount = useCallback((nextChapterCount: number) => {
    dispatch(appActions.setBookSessionChapterCount(nextChapterCount));
  }, [dispatch]);

  const setLoading = useCallback((nextLoading: boolean) => {
    dispatch(appActions.setBookSessionLoading(nextLoading));
  }, [dispatch]);

  const setBookId = useCallback((nextBookId: string | null) => {
    dispatch(appActions.setReaderBookId(nextBookId));
  }, [dispatch]);

  const setCurrentPage = useCallback(
    (page: number) => {
      dispatch(appActions.setReaderCurrentPage(page));
    },
    [dispatch]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      dispatch(appActions.setReaderViewMode(mode));
    },
    [dispatch]
  );

  const setBookModalOpen = useCallback(
    (open: boolean) => {
      dispatch(appActions.setModalOpen('bookSelect', open));
    },
    [dispatch]
  );

  const bookSessionActions = useMemo<BookSessionActions>(
    () => createBookSessionActions({
      applyLoadedBooks: (loadedBooks, currentBookId) => {
        setBooks(loadedBooks);
        if (loadedBooks.length === 0) {
          setBookId(null);
          showToast('No books found. Add files to /data to begin.', 'info');
          return;
        }
        if (currentBookId && loadedBooks.includes(currentBookId)) {
          return;
        }
        if (!currentBookId) {
          setBookModalOpen(true);
          return;
        }
        const fallback = loadedBooks[0];
        setBookId(fallback);
        saveLastBook(fallback);
      },
      applyLoadedManifest: (data, options) => {
        setBookType(data.bookType);
        setChapterCount(data.chapterCount);
        setManifest(data.manifest);
        const storedPage = loadLastPage(data.book);
        const requestedPage = options.requestedPageFromLocation ?? storedPage ?? options.pendingPage ?? 0;
        const navCount = data.bookType === 'text' ? data.chapterCount : data.manifest.length;
        if (navCount > 0) {
          const safePage = clamp(requestedPage, 0, navCount - 1);
          setCurrentPage(safePage);
          pendingPageRef.current = null;
        } else {
          setCurrentPage(0);
        }
        const requestedView = options.requestedViewFromLocation;
        if (data.bookType === 'text') {
          setViewMode(requestedView && requestedView !== 'pages' ? requestedView : 'text');
          showToast(`Loaded ${data.chapterFileCount} chapters`, 'success');
        } else {
          setViewMode(requestedView === 'scroll' || requestedView === 'pages' ? requestedView : 'pages');
          showToast(`Loaded ${data.manifest.length} pages`, 'success');
        }
      },
      resetBookManifest: () => {
        setManifest([]);
        setBookType('image');
        setChapterCount(0);
      },
      setLoading,
      showInfo: (message) => showToast(message, 'info'),
      showSuccess: (message) => showToast(message, 'success'),
      showError: (message) => showToast(message, 'error')
    }),
    [
      setBookId,
      setBookModalOpen,
      setBooks,
      setBookType,
      setChapterCount,
      setCurrentPage,
      setLoading,
      setManifest,
      setViewMode,
      showToast
    ]
  );
  const bookSessionActionsRef = useRef(bookSessionActions);

  useEffect(() => {
    bookSessionActionsRef.current = bookSessionActions;
  }, [bookSessionActions]);

  useEffect(() => {
    let cancelled = false;
    void loadLibraryStateFromServer()
      .then((state) => {
        if (cancelled) {
          return;
        }
        if (!getBookFromLocation() && state.lastBook) {
          setBookId(state.lastBook);
        }
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setBookSessionLibraryStateReady(true));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, setBookId]);

  useEffect(() => {
    if (!libraryStateReady) {
      return;
    }
    void bookSessionHandlers.runAction('loadBooks', null, bookSessionActionsRef.current, {
      currentBookId: bookId
    });
  }, [bookId, libraryStateReady]);

  useEffect(() => {
    if (!libraryStateReady) {
      return;
    }
    if (mainView !== 'reader') {
      return;
    }
    if (!bookId) {
      setManifest([]);
      setBookType('image');
      setChapterCount(0);
      return;
    }
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    dispatch(appActions.setViewerMetrics(null));
    setManifest([]);
    setCurrentPage(0);

    const requestedPageFromLocation = getPageFromLocation(bookId);
    const requestedViewFromLocation = getViewModeFromLocation(bookId);
    void bookSessionHandlers.runAction('loadBookManifest', null, bookSessionActionsRef.current, {
      bookId,
      pendingPage: pendingPageRef.current,
      requestedPageFromLocation,
      requestedViewFromLocation
    });
  }, [
    bookId,
    mainView,
    libraryStateReady,
    dispatch
  ]);
}
