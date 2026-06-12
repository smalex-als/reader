import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  bookSessionHandlers,
  createBookSessionActions,
  type BookSessionActions
} from '@/hooks/bookSessionActions';
import { createDefaultSettings, type ViewMode } from '@/lib/appConstants';
import { useToast } from '@/hooks/useToast';
import { clamp } from '@/lib/math';
import {
  appActions,
  selectBookChapterCount,
  selectBookIds,
  selectBookLibraryStateReady,
  selectBookManifest,
  selectBookType,
  selectNavigationState,
  selectReaderSession,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadLastPage,
  loadLibraryStateFromServer,
  loadSettingsForBook,
  markBookOpened,
  saveLastBook,
  saveSettingsForBook
} from '@/lib/storage';

function getBookFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const book = params.get('book')?.trim();
  return book ? book : null;
}

function getPageFromLocation(expectedBookId: string | null): number | null {
  const params = new URLSearchParams(window.location.search);
  const locationBook = params.get('book')?.trim() || null;
  if (!expectedBookId || locationBook !== expectedBookId) {
    return null;
  }
  const rawPage = params.get('page');
  if (!rawPage) {
    return null;
  }
  const parsed = Number.parseInt(rawPage, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed - 1;
}

function getViewModeFromLocation(expectedBookId: string | null): ViewMode | null {
  const params = new URLSearchParams(window.location.search);
  const locationBook = params.get('book')?.trim() || null;
  if (!expectedBookId || locationBook !== expectedBookId) {
    return null;
  }
  const rawView = params.get('view');
  if (rawView === 'pages' || rawView === 'scroll' || rawView === 'text' || rawView === 'audio') {
    return rawView;
  }
  return null;
}

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useBookSession() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const books = useAppSelector(selectBookIds);
  const manifest = useAppSelector(selectBookManifest);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const libraryStateReady = useAppSelector(selectBookLibraryStateReady);
  const pendingPageRef = useRef<number | null>(null);
  const shouldUseLocationPositionRef = useRef(true);
  const urlSyncPaused = mainView === 'units';

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

  const setBookId = useCallback((nextBookId: string | null, options?: { preferLocationPosition?: boolean }) => {
    shouldUseLocationPositionRef.current = options?.preferLocationPosition ?? false;
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
    if (bookId) {
      saveLastBook(bookId);
      markBookOpened(bookId);
    }
  }, [bookId]);

  useEffect(() => {
    if (urlSyncPaused) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const currentParam = params.get('book');
    const currentPageParam = params.get('page');
    const currentViewParam = params.get('view');
    const navCount = bookType === 'text' ? chapterCount : manifest.length;
    const shouldSyncPosition = Boolean(bookId) && navCount > 0;
    const nextPageParam = shouldSyncPosition ? String(currentPage + 1) : null;
    const nextViewParam = shouldSyncPosition ? viewMode : null;
    if (
      (bookId ?? '') === (currentParam ?? '') &&
      (!shouldSyncPosition || (nextPageParam ?? '') === (currentPageParam ?? '')) &&
      (!shouldSyncPosition || (nextViewParam ?? '') === (currentViewParam ?? ''))
    ) {
      return;
    }
    if (bookId) {
      params.set('book', bookId);
    } else {
      params.delete('book');
    }
    if (nextPageParam) {
      params.set('page', nextPageParam);
    } else if (!bookId) {
      params.delete('page');
    }
    if (nextViewParam) {
      params.set('view', nextViewParam);
    } else if (!bookId) {
      params.delete('view');
    }
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
      window.location.hash
    }`;
    window.history.replaceState(null, '', nextUrl);
  }, [bookId, bookType, chapterCount, currentPage, manifest.length, urlSyncPaused, viewMode]);

  useEffect(() => {
    const handleLocationChange = () => {
      setBookId(getBookFromLocation(), { preferLocationPosition: true });
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [setBookId]);

  useEffect(() => {
    if (!libraryStateReady) {
      return;
    }
    if (!bookId) {
      setManifest([]);
      setBookType('image');
      setChapterCount(0);
      return;
    }
    const baseSettings = createDefaultSettings();
    const storedSettings = loadSettingsForBook(bookId);
    const nextSettings = storedSettings
      ? {
          ...baseSettings,
          ...storedSettings,
          pan: { ...baseSettings.pan, ...storedSettings.pan }
        }
      : baseSettings;
    dispatch(appActions.setViewerSettings(nextSettings));
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    dispatch(appActions.setViewerMetrics(null));
    setManifest([]);
    setCurrentPage(0);

    const requestedPageFromLocation = shouldUseLocationPositionRef.current ? getPageFromLocation(bookId) : null;
    const requestedViewFromLocation = shouldUseLocationPositionRef.current ? getViewModeFromLocation(bookId) : null;
    shouldUseLocationPositionRef.current = false;
    void bookSessionHandlers.runAction('loadBookManifest', null, bookSessionActionsRef.current, {
      bookId,
      pendingPage: pendingPageRef.current,
      requestedPageFromLocation,
      requestedViewFromLocation
    });
  }, [
    bookId,
    createDefaultSettings,
    libraryStateReady,
    dispatch
  ]);

  useEffect(() => {
    if (!bookId) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveSettingsForBook(bookId, settings);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [bookId, settings]);
}
