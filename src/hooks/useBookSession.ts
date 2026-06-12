import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  bookSessionHandlers,
  createBookSessionActions,
  type BookSessionActions
} from '@/hooks/bookSessionActions';
import type { ViewMode } from '@/lib/appConstants';
import {
  getPageFromLocation,
  getViewModeFromLocation
} from '@/lib/bookUrl';
import { useToast } from '@/hooks/useToast';
import { clamp } from '@/lib/math';
import {
  appActions,
  selectBookLibraryStateReady,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadLastPage
} from '@/lib/storage';

export function useBookSession() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId } = useAppSelector(selectReaderSession);
  const libraryStateReady = useAppSelector(selectBookLibraryStateReady);
  const pendingPageRef = useRef<number | null>(null);

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

  const bookSessionActions = useMemo<BookSessionActions>(
    () => createBookSessionActions({
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
