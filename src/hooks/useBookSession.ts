import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '@/lib/math';
import {
  loadLastBook,
  loadLastPage,
  loadSettingsForBook,
  loadStreamVoiceForBook,
  saveLastBook,
  saveSettingsForBook,
  saveStreamVoiceForBook
} from '@/lib/storage';
import type { AppSettings, TocEntry, ToastMessage, ViewerMetrics } from '@/types/app';

const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

type ViewMode = 'pages' | 'text';

type BookSessionOptions<StreamVoice extends string> = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setMetrics: React.Dispatch<React.SetStateAction<ViewerMetrics | null>>;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
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

export function useBookSession<StreamVoice extends string>({
  settings,
  setSettings,
  setMetrics,
  showToast,
  setEditorOpen,
  setEditorChapterNumber,
  onUpdateTocEntries,
  streamVoice,
  setStreamVoice,
  isStreamVoice,
  getDefaultStreamVoice,
  createDefaultSettings
}: BookSessionOptions<StreamVoice>) {
  const [books, setBooks] = useState<string[]>([]);
  const [bookId, setBookId] = useState<string | null>(() => getBookFromLocation() ?? loadLastBook());
  const [manifest, setManifest] = useState<string[]>([]);
  const [bookType, setBookType] = useState<'image' | 'text'>('image');
  const [chapterCount, setChapterCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('pages');
  const [loading, setLoading] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [uploadingChapter, setUploadingChapter] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pendingPageRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, [bookId, showToast]);

  useEffect(() => {
    if (bookId) {
      saveLastBook(bookId);
    }
  }, [bookId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentParam = params.get('book');
    if ((bookId ?? '') === (currentParam ?? '')) {
      return;
    }
    if (bookId) {
      params.set('book', bookId);
    } else {
      params.delete('book');
    }
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
      window.location.hash
    }`;
    window.history.replaceState(null, '', nextUrl);
  }, [bookId]);

  useEffect(() => {
    const handleLocationChange = () => {
      setBookId(getBookFromLocation());
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  useEffect(() => {
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
        const data = await fetchJson<{
          book: string;
          manifest: string[];
          bookType?: 'image' | 'text';
          chapterCount?: number;
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
        const requestedPage = storedPage ?? pendingPageRef.current ?? 0;
        const navCount = nextBookType === 'text' ? nextChapterCount : nextManifest.length;
        if (navCount > 0) {
          const safePage = clamp(requestedPage, 0, navCount - 1);
          setCurrentPage(safePage);
          pendingPageRef.current = null;
        } else {
          setCurrentPage(0);
        }
        if (nextBookType === 'text') {
          setViewMode('text');
          showToast(`Loaded ${nextChapterCount} chapters`, 'success');
        } else {
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
    setMetrics,
    setSettings,
    setStreamVoice,
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
    [bookId, bookType, books, onUpdateTocEntries, showToast]
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
    [bookId, bookType, books, onUpdateTocEntries, setEditorChapterNumber, setEditorOpen, showToast]
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
    [onUpdateTocEntries, showToast]
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
    [bookId, showToast]
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
    uploadingPdf,
    handleUploadChapter,
    handleCreateChapter,
    handleUploadPdf,
    handleDeleteBook
  };
}
