import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ViewMode } from '@/lib/appConstants';
import { useToast } from '@/hooks/useToast';
import { clamp } from '@/lib/math';
import {
  appActions,
  selectBookSessionWorkflow,
  selectModalOpen,
  selectReaderSession,
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
import type { AppSettings, TocEntry, ViewerMetrics } from '@/types/app';

const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

type BookSessionOptions<StreamVoice extends string> = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setMetrics: React.Dispatch<React.SetStateAction<ViewerMetrics | null>>;
  urlSyncPaused?: boolean;
  setEditorOpen: (open: boolean) => void;
  setEditorChapterNumber: React.Dispatch<React.SetStateAction<number | null>>;
  onUpdateTocEntries: (entries: TocEntry[]) => void;
  streamVoice: StreamVoice;
  setStreamVoice: React.Dispatch<React.SetStateAction<StreamVoice>>;
  isStreamVoice: (value: string) => value is StreamVoice;
  getDefaultStreamVoice: () => StreamVoice;
  createDefaultSettings: () => AppSettings;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
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

export function useBookSession<StreamVoice extends string>({
  settings,
  setSettings,
  setMetrics,
  urlSyncPaused = false,
  setEditorOpen,
  setEditorChapterNumber,
  onUpdateTocEntries,
  streamVoice,
  setStreamVoice,
  isStreamVoice,
  getDefaultStreamVoice,
  createDefaultSettings
}: BookSessionOptions<StreamVoice>) {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const bookModalOpen = useAppSelector(selectModalOpen('bookSelect'));
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
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
    (async () => {
      try {
        const data = await fetchJson<{ books: string[] }>('/api/books');
        setBooks(data.books);
        if (data.books.length === 0) {
          setBookId(null);
          showToast('No books found. Add files to /data to begin.', 'info');
          return;
        }
        if (bookId && data.books.includes(bookId)) {
          return;
        }
        if (!bookId) {
          setBookModalOpen(true);
          return;
        }
        const fallback = data.books[0];
        setBookId(fallback);
        saveLastBook(fallback);
      } catch (error) {
        console.error(error);
        showToast('Unable to load books', 'error');
      }
    })();
  }, [bookId, libraryStateReady, setBookId, setBookModalOpen, showToast]);

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
      setStreamVoice(getDefaultStreamVoice());
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
    setSettings(nextSettings);
    const storedVoice = loadStreamVoiceForBook(bookId);
    if (storedVoice && isStreamVoice(storedVoice)) {
      setStreamVoice(storedVoice);
    } else {
      setStreamVoice(getDefaultStreamVoice());
    }
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    setMetrics(null);
    setManifest([]);
    setCurrentPage(0);

    (async () => {
      try {
        const requestedPageFromLocation = shouldUseLocationPositionRef.current ? getPageFromLocation(bookId) : null;
        const requestedViewFromLocation = shouldUseLocationPositionRef.current ? getViewModeFromLocation(bookId) : null;
        shouldUseLocationPositionRef.current = false;
        const data = await fetchJson<{
          book: string;
          manifest: string[];
          bookType?: 'image' | 'text';
          chapterCount?: number;
          chapterFileCount?: number;
        }>(`/api/books/${encodeURIComponent(bookId)}/manifest`);
        const nextBookType = data.bookType === 'text' ? 'text' : 'image';
        const nextChapterCount =
          typeof data.chapterCount === 'number' && Number.isInteger(data.chapterCount)
            ? data.chapterCount
            : 0;
        const nextManifest = Array.isArray(data.manifest) ? data.manifest : [];
        setBookType(nextBookType);
        setChapterCount(nextChapterCount);
        setManifest(nextManifest);
        const storedPage = loadLastPage(bookId);
        const requestedPage = requestedPageFromLocation ?? storedPage ?? pendingPageRef.current ?? 0;
        const navCount = nextBookType === 'text' ? nextChapterCount : nextManifest.length;
        if (navCount > 0) {
          const safePage = clamp(requestedPage, 0, navCount - 1);
          setCurrentPage(safePage);
          pendingPageRef.current = null;
        } else {
          setCurrentPage(0);
        }
        const requestedView = requestedViewFromLocation;
        if (nextBookType === 'text') {
          setViewMode(requestedView && requestedView !== 'pages' ? requestedView : 'text');
          const loadedChapters =
            typeof data.chapterFileCount === 'number' && Number.isInteger(data.chapterFileCount)
              ? data.chapterFileCount
              : nextChapterCount;
          showToast(`Loaded ${loadedChapters} chapters`, 'success');
        } else {
          setViewMode(requestedView === 'scroll' || requestedView === 'pages' ? requestedView : 'pages');
          showToast(`Loaded ${nextManifest.length} pages`, 'success');
        }
      } catch (error) {
        console.error(error);
        showToast('Unable to load book manifest', 'error');
        setManifest([]);
        setBookType('image');
        setChapterCount(0);
      } finally {
        setLoading(false);
      }
    })();
  }, [
    bookId,
    createDefaultSettings,
    getDefaultStreamVoice,
    isStreamVoice,
    libraryStateReady,
    setMetrics,
    setSettings,
    setCurrentPage,
    setStreamVoice,
    setViewMode,
    showToast,
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

  const handleUploadChapter = useCallback(
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
      setUploadingChapter(true);
      try {
        const formData = new FormData();
        if (chapterTitle) {
          formData.append('chapterTitle', chapterTitle);
        }
        formData.append('file', file);
        let response: Response;
        if (isExisting) {
          response = await fetch(`/api/books/${encodeURIComponent(targetBookId)}/chapters`, {
            method: 'POST',
            body: formData
          });
        } else {
          formData.append('bookName', bookName);
          response = await fetch('/api/books/text', { method: 'POST', body: formData });
        }
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          book: string;
          bookType?: 'text';
          chapterIndex?: number;
          chapterCount?: number;
          chapterFileCount?: number;
          toc?: TocEntry[];
        };
        const newBookId = data.book;
        setBooks((prev) => {
          const next = Array.from(new Set([...prev, newBookId]));
          next.sort((a, b) => a.localeCompare(b, 'en', BOOK_SORT_OPTIONS));
          return next;
        });
        setBookId(newBookId);
        setBookType('text');
        setChapterCount(Number.isInteger(data.chapterCount) ? (data.chapterCount as number) : 0);
        setManifest([]);
        onUpdateTocEntries(Array.isArray(data.toc) ? data.toc : []);
        setCurrentPage(Number.isInteger(data.chapterIndex) ? (data.chapterIndex as number) : 0);
        setViewMode('text');
        setBookModalOpen(false);
        showToast('Chapter uploaded', 'success');
      } catch (error) {
        console.error(error);
        showToast('Failed to upload chapter', 'error');
      } finally {
        setUploadingChapter(false);
      }
    },
    [
      bookId,
      bookType,
      books,
      onUpdateTocEntries,
      setBookId,
      setBookModalOpen,
      setCurrentPage,
      setViewMode,
      showToast
    ]
  );

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
      setUploadingChapter(true);
      try {
        let response: Response;
        if (isExisting) {
          response = await fetch(`/api/books/${encodeURIComponent(targetBookId)}/chapters/empty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chapterTitle })
          });
        } else {
          response = await fetch('/api/books/text/empty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookName, chapterTitle })
          });
        }
        if (!response.ok) {
          throw new Error(`Create failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          book: string;
          bookType?: 'text';
          chapterIndex?: number;
          chapterCount?: number;
          chapterFileCount?: number;
          toc?: TocEntry[];
        };
        const newBookId = data.book;
        setBooks((prev) => {
          const next = Array.from(new Set([...prev, newBookId]));
          next.sort((a, b) => a.localeCompare(b, 'en', BOOK_SORT_OPTIONS));
          return next;
        });
        setBookId(newBookId);
        setBookType('text');
        setChapterCount(Number.isInteger(data.chapterCount) ? (data.chapterCount as number) : 0);
        setManifest([]);
        onUpdateTocEntries(Array.isArray(data.toc) ? data.toc : []);
        const nextChapterIndex = Number.isInteger(data.chapterIndex)
          ? (data.chapterIndex as number)
          : null;
        setCurrentPage(nextChapterIndex ?? 0);
        setEditorChapterNumber(nextChapterIndex !== null ? nextChapterIndex + 1 : null);
        setEditorOpen(true);
        setViewMode('text');
        setBookModalOpen(false);
        showToast('Chapter created', 'success');
      } catch (error) {
        console.error(error);
        showToast('Failed to create chapter', 'error');
      } finally {
        setUploadingChapter(false);
      }
    },
    [
      bookId,
      bookType,
      books,
      onUpdateTocEntries,
      setBookId,
      setBookModalOpen,
      setCurrentPage,
      setEditorChapterNumber,
      setEditorOpen,
      setViewMode,
      showToast
    ]
  );

  const handleUploadPdf = useCallback(
    async (file: File) => {
      setUploadingPdf(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/upload/pdf', { method: 'POST', body: formData });
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        const data = (await response.json()) as { book: string; manifest?: string[] };
        const newBookId = data.book;
        setBooks((prev) => {
          const next = Array.from(new Set([...prev, newBookId]));
          next.sort((a, b) => a.localeCompare(b, 'en', BOOK_SORT_OPTIONS));
          return next;
        });
        setBookId(newBookId);
        setBookType('image');
        setChapterCount(0);
        setManifest(Array.isArray(data.manifest) ? data.manifest : []);
        onUpdateTocEntries([]);
        setCurrentPage(0);
        setViewMode('pages');
        setBookModalOpen(false);
        showToast('Book created from PDF', 'success');
      } catch (error) {
        console.error(error);
        showToast('Failed to upload PDF', 'error');
      } finally {
        setUploadingPdf(false);
      }
    },
    [onUpdateTocEntries, setBookId, setBookModalOpen, setCurrentPage, setViewMode, showToast]
  );

  const handleDeleteBook = useCallback(
    async (targetBookId: string) => {
      const confirmed = window.confirm(
        `Delete "${targetBookId}" and all of its files? This cannot be undone.`
      );
      if (!confirmed) {
        return;
      }
      try {
        const data = await fetchJson<{ book: string; books: string[] }>(
          `/api/books/${encodeURIComponent(targetBookId)}`,
          { method: 'DELETE' }
        );
        removeBookStorage(targetBookId);
        setBooks(data.books);
        showToast(`Deleted ${data.book}`, 'success');

        if (bookId === targetBookId) {
          if (data.books.length === 0) {
            setBookId(null);
            setBookModalOpen(true);
            showToast('No books found. Add files to /data to begin.', 'info');
          } else {
            const fallback = data.books[0];
            setBookId(fallback);
            saveLastBook(fallback);
          }
        }
      } catch (error) {
        console.error(error);
        showToast('Unable to delete book', 'error');
      }
    },
    [bookId, setBookId, setBookModalOpen, showToast]
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
      setDeletingChapter(true);
      try {
        const data = await fetchJson<{
          book: string;
          bookType?: 'text';
          chapterNumber: number;
          chapterIndex: number;
          chapterCount?: number;
          chapterFileCount?: number;
          toc?: TocEntry[];
        }>(`/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}`, {
          method: 'DELETE'
        });
        const nextChapterCount = Number.isInteger(data.chapterCount) ? (data.chapterCount as number) : 0;
        const nextToc = Array.isArray(data.toc) ? data.toc : [];
        setChapterCount(nextChapterCount);
        onUpdateTocEntries(nextToc);
        if (nextChapterCount <= 0) {
          setCurrentPage(0);
        } else {
          const deletedIndex = Number.isInteger(data.chapterIndex) ? data.chapterIndex : chapterNumber - 1;
          const sortedPages = nextToc
            .map((entry) => entry.page)
            .filter((page) => Number.isInteger(page) && page >= 0 && page < nextChapterCount)
            .sort((a, b) => a - b);
          const nextExistingPage =
            sortedPages.find((page) => page > deletedIndex) ??
            [...sortedPages].reverse().find((page) => page < deletedIndex) ??
            clamp(Math.min(deletedIndex, nextChapterCount - 1), 0, nextChapterCount - 1);
          setCurrentPage(nextExistingPage);
          saveLastPage(bookId, nextExistingPage);
        }
        setEditorOpen(false);
        setEditorChapterNumber(null);
        showToast(`Deleted chapter ${data.chapterNumber}`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to delete chapter', 'error');
      } finally {
        setDeletingChapter(false);
      }
    },
    [
      bookId,
      bookType,
      onUpdateTocEntries,
      setCurrentPage,
      setEditorChapterNumber,
      setEditorOpen,
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
    handleUploadChapter,
    handleCreateChapter,
    handleUploadPdf,
    handleDeleteBook,
    handleDeleteChapter
  };
}
