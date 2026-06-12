import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  createEmptyTextChapter,
  deleteBook,
  deleteTextChapter,
  fetchBookIds,
  fetchBookManifest,
  uploadPdfBook,
  uploadTextChapter,
  type BookManifestResult,
  type DeleteBookResult,
  type TextChapterMutationResult,
  type UploadPdfResult
} from '@/api/bookSession';
import { createDefaultSettings, type ViewMode } from '@/lib/appConstants';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import { clamp } from '@/lib/math';
import {
  appActions,
  selectBookSessionWorkflow,
  selectModalOpen,
  selectNavigationState,
  selectReaderSession,
  selectViewerWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadLastPage,
  loadLibraryStateFromServer,
  loadSettingsForBook,
  loadStreamVoiceForBook,
  markBookOpened,
  removeBookStorage,
  saveLastBook,
  saveLastPage,
  saveSettingsForBook,
  saveStreamVoiceForBook
} from '@/lib/storage';
import type { AppSettings } from '@/types/app';

const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

type BookSessionPayloads = {
  loadBooks: {
    currentBookId: string | null;
  };
  loadBookManifest: {
    bookId: string;
    pendingPage: number | null;
    requestedPageFromLocation: number | null;
    requestedViewFromLocation: ViewMode | null;
  };
  createChapter: {
    bookName: string;
    chapterTitle: string;
    targetBookId: string;
    isExisting: boolean;
  };
  deleteChapter: {
    bookId: string;
    chapterNumber: number;
  };
  deleteBook: {
    targetBookId: string;
    currentBookId: string | null;
  };
  uploadPdf: {
    file: File;
  };
  uploadChapter: {
    file: File;
    bookName: string;
    chapterTitle: string;
    targetBookId: string;
    isExisting: boolean;
  };
};

type BookSessionActions = {
  applyLoadedBooks: (books: string[], currentBookId: string | null) => void;
  applyLoadedManifest: (
    result: BookManifestResult,
    options: Pick<BookSessionPayloads['loadBookManifest'], 'pendingPage' | 'requestedPageFromLocation' | 'requestedViewFromLocation'>
  ) => void;
  applyCreatedChapter: (result: TextChapterMutationResult) => void;
  applyDeletedChapter: (bookId: string, chapterNumber: number, result: TextChapterMutationResult) => void;
  applyDeletedBook: (targetBookId: string, currentBookId: string | null, result: DeleteBookResult) => void;
  applyUploadedPdf: (result: UploadPdfResult) => void;
  applyUploadedChapter: (result: TextChapterMutationResult) => void;
  resetBookManifest: () => void;
  setLoading: (loading: boolean) => void;
  setUploadingChapter: (uploading: boolean) => void;
  setDeletingChapter: (deleting: boolean) => void;
  setUploadingPdf: (uploading: boolean) => void;
  showInfo: (message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const bookSessionHandlers = createActionHandlerRegistry<
  null,
  BookSessionActions,
  BookSessionPayloads
>();
const { addActionHandler } = bookSessionHandlers;

addActionHandler('loadBooks', async (_state, actions, payload): Promise<void> => {
  try {
    const books = await fetchBookIds();
    actions.applyLoadedBooks(books, payload.currentBookId);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to load books');
  }
});

addActionHandler('loadBookManifest', async (_state, actions, payload): Promise<void> => {
  actions.setLoading(true);
  try {
    const result = await fetchBookManifest(payload.bookId);
    actions.applyLoadedManifest(result, {
      pendingPage: payload.pendingPage,
      requestedPageFromLocation: payload.requestedPageFromLocation,
      requestedViewFromLocation: payload.requestedViewFromLocation
    });
  } catch (error) {
    console.error(error);
    actions.showError('Unable to load book manifest');
    actions.resetBookManifest();
  } finally {
    actions.setLoading(false);
  }
});

addActionHandler('createChapter', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingChapter(true);
  try {
    const result = await createEmptyTextChapter(payload);
    actions.applyCreatedChapter(result);
    actions.showSuccess('Chapter created');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to create chapter');
  } finally {
    actions.setUploadingChapter(false);
  }
});

addActionHandler('deleteChapter', async (_state, actions, payload): Promise<void> => {
  actions.setDeletingChapter(true);
  try {
    const result = await deleteTextChapter(payload.bookId, payload.chapterNumber);
    actions.applyDeletedChapter(payload.bookId, payload.chapterNumber, result);
    actions.showSuccess(`Deleted chapter ${result.chapterNumber ?? payload.chapterNumber}`);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to delete chapter');
  } finally {
    actions.setDeletingChapter(false);
  }
});

addActionHandler('deleteBook', async (_state, actions, payload): Promise<void> => {
  try {
    const result = await deleteBook(payload.targetBookId);
    removeBookStorage(payload.targetBookId);
    actions.applyDeletedBook(payload.targetBookId, payload.currentBookId, result);
    actions.showSuccess(`Deleted ${result.book}`);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to delete book');
  }
});

addActionHandler('uploadPdf', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingPdf(true);
  try {
    const result = await uploadPdfBook(payload.file);
    actions.applyUploadedPdf(result);
    actions.showSuccess('Book created from PDF');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to upload PDF');
  } finally {
    actions.setUploadingPdf(false);
  }
});

addActionHandler('uploadChapter', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingChapter(true);
  try {
    const result = await uploadTextChapter(payload);
    actions.applyUploadedChapter(result);
    actions.showSuccess('Chapter uploaded');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to upload chapter');
  } finally {
    actions.setUploadingChapter(false);
  }
});

const EMPTY_BOOK_SESSION_ACTIONS: BookSessionActions = {
  applyLoadedBooks: () => {},
  applyLoadedManifest: () => {},
  applyCreatedChapter: () => {},
  applyDeletedChapter: () => {},
  applyDeletedBook: () => {},
  applyUploadedPdf: () => {},
  applyUploadedChapter: () => {},
  resetBookManifest: () => {},
  setLoading: () => {},
  setUploadingChapter: () => {},
  setDeletingChapter: () => {},
  setUploadingPdf: () => {},
  showInfo: () => {},
  showSuccess: () => {},
  showError: () => {}
};

function createBookSessionActions(actions: Partial<BookSessionActions>): BookSessionActions {
  return {
    ...EMPTY_BOOK_SESSION_ACTIONS,
    ...actions
  };
}

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

function addSortedBook(books: string[], bookId: string) {
  const next = Array.from(new Set([...books, bookId]));
  next.sort((a, b) => a.localeCompare(b, 'en', BOOK_SORT_OPTIONS));
  return next;
}

export function useBookSession() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const bookModalOpen = useAppSelector(selectModalOpen('bookSelect'));
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { defaultStreamVoice, streamVoice, streamVoiceOptions } = useAppSelector(selectVoiceWorkflow);
  const {
    books,
    manifest,
    bookType,
    chapterCount,
    loading,
    uploadingChapter,
    deletingChapter,
    uploadingPdf,
    libraryStateReady
  } = useAppSelector(selectBookSessionWorkflow);
  const pendingPageRef = useRef<number | null>(null);
  const shouldUseLocationPositionRef = useRef(true);
  const urlSyncPaused = mainView === 'units';
  const isStreamVoice = useCallback(
    (value: string) => streamVoiceOptions.length === 0 || streamVoiceOptions.some((voice) => voice.id === value),
    [streamVoiceOptions]
  );
  const getDefaultStreamVoice = useCallback(
    () => defaultStreamVoice || streamVoiceOptions[0]?.id || '',
    [defaultStreamVoice, streamVoiceOptions]
  );

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

  const setUploadingChapter = useCallback((uploading: boolean) => {
    dispatch(appActions.setBookSessionUploadingChapter(uploading));
  }, [dispatch]);

  const setDeletingChapter = useCallback((deleting: boolean) => {
    dispatch(appActions.setBookSessionDeletingChapter(deleting));
  }, [dispatch]);

  const setUploadingPdf = useCallback((uploading: boolean) => {
    dispatch(appActions.setBookSessionUploadingPdf(uploading));
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
    () => ({
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
      applyCreatedChapter: (data) => {
        const newBookId = data.book;
        setBooks((prev) => addSortedBook(prev, newBookId));
        setBookId(newBookId);
        setBookType('text');
        setChapterCount(data.chapterCount);
        setManifest([]);
        dispatch(appActions.setTocEntries(data.toc));
        setCurrentPage(data.chapterIndex ?? 0);
        dispatch(appActions.setEditorChapterNumber(data.chapterIndex !== null ? data.chapterIndex + 1 : null));
        dispatch(appActions.setEditorOpen(true));
        setViewMode('text');
        setBookModalOpen(false);
      },
      applyDeletedChapter: (targetBookId, chapterNumber, data) => {
        const nextChapterCount = data.chapterCount;
        const nextToc = data.toc;
        setChapterCount(nextChapterCount);
        dispatch(appActions.setTocEntries(nextToc));
        if (nextChapterCount <= 0) {
          setCurrentPage(0);
        } else {
          const deletedIndex = data.chapterIndex ?? chapterNumber - 1;
          const sortedPages = nextToc
            .map((entry) => entry.page)
            .filter((page) => Number.isInteger(page) && page >= 0 && page < nextChapterCount)
            .sort((a, b) => a - b);
          const nextExistingPage =
            sortedPages.find((page) => page > deletedIndex) ??
            [...sortedPages].reverse().find((page) => page < deletedIndex) ??
            clamp(Math.min(deletedIndex, nextChapterCount - 1), 0, nextChapterCount - 1);
          setCurrentPage(nextExistingPage);
          saveLastPage(targetBookId, nextExistingPage);
        }
        dispatch(appActions.setEditorOpen(false));
        dispatch(appActions.setEditorChapterNumber(null));
      },
      applyDeletedBook: (targetBookId, currentBookId, data) => {
        dispatch(appActions.setBookSessionBooks(data.books));
        if (currentBookId !== targetBookId) {
          return;
        }
        if (data.books.length === 0) {
          dispatch(appActions.setReaderBookId(null));
          dispatch(appActions.setModalOpen('bookSelect', true));
          showToast('No books found. Add files to /data to begin.', 'info');
          return;
        }
        const fallback = data.books[0];
        dispatch(appActions.setReaderBookId(fallback));
        saveLastBook(fallback);
      },
      applyUploadedPdf: (data) => {
        const newBookId = data.book;
        dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
        dispatch(appActions.setReaderBookId(newBookId));
        dispatch(appActions.setBookSessionBookType('image'));
        dispatch(appActions.setBookSessionChapterCount(0));
        dispatch(appActions.setBookSessionManifest(data.manifest));
        dispatch(appActions.setTocEntries([]));
        dispatch(appActions.setDetailedTocEntries([]));
        dispatch(appActions.setReaderCurrentPage(0));
        dispatch(appActions.setReaderViewMode('pages'));
        dispatch(appActions.setModalOpen('bookSelect', false));
      },
      applyUploadedChapter: (data) => {
        const newBookId = data.book;
        dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
        dispatch(appActions.setReaderBookId(newBookId));
        dispatch(appActions.setBookSessionBookType('text'));
        dispatch(appActions.setBookSessionChapterCount(data.chapterCount));
        dispatch(appActions.setBookSessionManifest([]));
        dispatch(appActions.setTocEntries(data.toc));
        dispatch(appActions.setReaderCurrentPage(data.chapterIndex ?? 0));
        dispatch(appActions.setReaderViewMode('text'));
        dispatch(appActions.setModalOpen('bookSelect', false));
      },
      resetBookManifest: () => {
        setManifest([]);
        setBookType('image');
        setChapterCount(0);
      },
      setLoading,
      setUploadingChapter,
      setDeletingChapter,
      setUploadingPdf,
      showInfo: (message) => showToast(message, 'info'),
      showSuccess: (message) => showToast(message, 'success'),
      showError: (message) => showToast(message, 'error')
    }),
    [
      books,
      dispatch,
      setBookId,
      setBookModalOpen,
      setBooks,
      setBookType,
      setChapterCount,
      setCurrentPage,
      setDeletingChapter,
      setLoading,
      setManifest,
      setUploadingChapter,
      setUploadingPdf,
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
      dispatch(appActions.setStreamVoice(getDefaultStreamVoice()));
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
    const storedVoice = loadStreamVoiceForBook(bookId);
    if (storedVoice && isStreamVoice(storedVoice)) {
      dispatch(appActions.setStreamVoice(storedVoice));
    } else {
      dispatch(appActions.setStreamVoice(getDefaultStreamVoice()));
    }
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
    getDefaultStreamVoice,
    isStreamVoice,
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

  useEffect(() => {
    if (!bookId) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveStreamVoiceForBook(bookId, streamVoice);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [bookId, streamVoice]);

  const handleCreateChapter = useCallback(
    async (details: { bookName: string; chapterTitle: string }) => {
      const bookName = details.bookName.trim();
      const chapterTitle = details.chapterTitle.trim();
      const targetBookId = bookName || bookId || '';
      if (!targetBookId) {
        showToast('Book name is required for a new text book', 'error');
        return;
      }
      if (!bookName && bookId && bookType !== 'text') {
        showToast('Select a text book or enter a new book name', 'error');
        return;
      }
      const isExisting = books.includes(targetBookId);
      await bookSessionHandlers.runAction('createChapter', null, bookSessionActionsRef.current, {
        bookName,
        chapterTitle,
        targetBookId,
        isExisting
      });
    },
    [
      bookId,
      bookType,
      books,
      showToast
    ]
  );

  const handleDeleteChapter = useCallback(
    async (chapterNumber: number) => {
      if (!bookId || bookType !== 'text') {
        return;
      }
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        showToast('Valid chapter is required', 'error');
        return;
      }
      const confirmed = window.confirm(
        `Delete chapter ${chapterNumber}? Other chapter numbers will stay unchanged.`
      );
      if (!confirmed) {
        return;
      }
      await bookSessionHandlers.runAction('deleteChapter', null, bookSessionActionsRef.current, {
        bookId,
        chapterNumber
      });
    },
    [
      bookId,
      bookType,
      showToast
    ]
  );

  return {
    books,
    bookId,
    setBookId,
    manifest,
    bookType,
    chapterCount,
    currentPage,
    setCurrentPage,
    viewMode,
    setViewMode,
    loading,
    bookModalOpen,
    setBookModalOpen,
    uploadingChapter,
    deletingChapter,
    uploadingPdf,
    handleCreateChapter,
    handleDeleteChapter
  };
}

export function useDeleteBook() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyDeletedBook: (targetBookId, currentBookId, data) => {
          dispatch(appActions.setBookSessionBooks(data.books));
          if (currentBookId !== targetBookId) {
            return;
          }
          if (data.books.length === 0) {
            dispatch(appActions.setReaderBookId(null));
            dispatch(appActions.setModalOpen('bookSelect', true));
            showToast('No books found. Add files to /data to begin.', 'info');
            return;
          }
          const fallback = data.books[0];
          dispatch(appActions.setReaderBookId(fallback));
          saveLastBook(fallback);
        },
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [dispatch, showToast]
  );

  return useCallback(
    async (targetBookId: string) => {
      const confirmed = window.confirm(
        `Delete "${targetBookId}" and all of its files? This cannot be undone.`
      );
      if (!confirmed) {
        return;
      }
      await bookSessionHandlers.runAction('deleteBook', null, actions, {
        targetBookId,
        currentBookId: bookId
      });
    },
    [actions, bookId]
  );
}

export function useUploadPdf() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { books } = useAppSelector(selectBookSessionWorkflow);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyUploadedPdf: (data) => {
          const newBookId = data.book;
          dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
          dispatch(appActions.setReaderBookId(newBookId));
          dispatch(appActions.setBookSessionBookType('image'));
          dispatch(appActions.setBookSessionChapterCount(0));
          dispatch(appActions.setBookSessionManifest(data.manifest));
          dispatch(appActions.setTocEntries([]));
          dispatch(appActions.setDetailedTocEntries([]));
          dispatch(appActions.setReaderCurrentPage(0));
          dispatch(appActions.setReaderViewMode('pages'));
          dispatch(appActions.setModalOpen('bookSelect', false));
        },
        setUploadingPdf: (uploading) => dispatch(appActions.setBookSessionUploadingPdf(uploading)),
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [books, dispatch, showToast]
  );

  return useCallback(
    async (file: File) => {
      await bookSessionHandlers.runAction('uploadPdf', null, actions, { file });
    },
    [actions]
  );
}

export function useUploadChapter() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const { books, bookType } = useAppSelector(selectBookSessionWorkflow);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyUploadedChapter: (data) => {
          const newBookId = data.book;
          dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
          dispatch(appActions.setReaderBookId(newBookId));
          dispatch(appActions.setBookSessionBookType('text'));
          dispatch(appActions.setBookSessionChapterCount(data.chapterCount));
          dispatch(appActions.setBookSessionManifest([]));
          dispatch(appActions.setTocEntries(data.toc));
          dispatch(appActions.setReaderCurrentPage(data.chapterIndex ?? 0));
          dispatch(appActions.setReaderViewMode('text'));
          dispatch(appActions.setModalOpen('bookSelect', false));
        },
        setUploadingChapter: (uploading) => dispatch(appActions.setBookSessionUploadingChapter(uploading)),
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [books, dispatch, showToast]
  );

  return useCallback(
    async (file: File, details: { bookName: string; chapterTitle: string }) => {
      const bookName = details.bookName.trim();
      const chapterTitle = details.chapterTitle.trim();
      const targetBookId = bookName || bookId || '';
      if (!targetBookId) {
        showToast('Book name is required for a new text book', 'error');
        return;
      }
      if (!bookName && bookId && bookType !== 'text') {
        showToast('Select a text book or enter a new book name', 'error');
        return;
      }
      const isExisting = books.includes(targetBookId);
      await bookSessionHandlers.runAction('uploadChapter', null, actions, {
        file,
        bookName,
        chapterTitle,
        targetBookId,
        isExisting
      });
    },
    [actions, bookId, bookType, books, showToast]
  );
}
