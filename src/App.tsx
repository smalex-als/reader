import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '@/components/Toolbar';
import Viewer from '@/components/Viewer';
import ChapterViewer from '@/components/ChapterViewer';
import ChapterEditor from '@/components/ChapterEditor';
import Toast from '@/components/Toast';
import TextModal from '@/components/TextModal';
import BookmarksModal from '@/components/BookmarksModal';
import PrintModal from '@/components/PrintModal';
import HelpModal from '@/components/HelpModal';
import BookSelectModal from '@/components/BookSelectModal';
import OcrQueueModal from '@/components/OcrQueueModal';
import TocModal from '@/components/TocModal';
import TocNavModal from '@/components/TocNavModal';
import { useToast } from '@/hooks/useToast';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useAudioController } from '@/hooks/useAudioController';
import { useBookmarks } from '@/hooks/useBookmarks';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { DEFAULT_STREAM_VOICE, useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useZoom } from '@/hooks/useZoom';
import { clamp, clampPan } from '@/lib/math';
import {
  loadLastBook,
  loadLastPage,
  loadSettingsForBook,
  loadStreamVoiceForBook,
  saveLastBook,
  saveLastPage,
  saveSettingsForBook,
  saveStreamVoiceForBook
} from '@/lib/storage';
import type { AppSettings, TocEntry } from '@/types/app';

const STREAM_VOICE_OPTIONS = [
  'en-Breeze_woman',
  'en-Brutalon_man',
  'en-Carter_man',
  'en-Clarion_man',
  'en-Clarissa_woman',
  'en-Davis_man',
  'en-Emma_woman',
  'en-Frank_man',
  'en-Grace_woman',
  'en-Gravitar_man',
  'en-Gravus_man',
  'en-MechCorsair_man',
  'en-Mike_man',
  'en-Oldenheart_man',
  'en-Silkvox_man',
  'en-Snarkling_woman',
  'en-Soother_woman'
] as const;
type StreamVoice = (typeof STREAM_VOICE_OPTIONS)[number];

const DEFAULT_SETTINGS: AppSettings = {
  zoom: 1,
  zoomMode: 'fit-width',
  rotation: 0,
  invert: false,
  brightness: 100,
  contrast: 100,
  pan: { x: 0, y: 0 }
};

const ZOOM_STEP = 0.15;
const PAN_STEP = 40;
const PAN_PAGE_STEP = 1000;
const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;
const STREAM_CHUNK_SIZE = 1000;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;

function stripMarkdown(text: string) {
  let output = text;
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`[^`]*`/g, '');
  output = output.replace(MARKDOWN_IMAGE_PATTERN, '$1');
  output = output.replace(MARKDOWN_LINK_PATTERN, '$1');
  output = output.replace(/[•●◦▪]/g, '-');
  output = output.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  output = output.replace(/^\s{0,3}>\s?/gm, '');
  output = output.replace(/^\s{0,3}[-*+]\s+/gm, '');
  output = output.replace(/^\s{0,3}---+\s*$/gm, '');
  output = output.replace(/\n{3,}/g, '\n\n');
  return output.trim();
}

function createDefaultSettings(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

function isStreamVoice(value: string): value is StreamVoice {
  return STREAM_VOICE_OPTIONS.includes(value as StreamVoice);
}

function getDefaultStreamVoice(): StreamVoice {
  return isStreamVoice(DEFAULT_STREAM_VOICE) ? DEFAULT_STREAM_VOICE : STREAM_VOICE_OPTIONS[0];
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function isTextInput(element: EventTarget | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
}

export default function App() {
  const [books, setBooks] = useState<string[]>([]);
  const [bookId, setBookId] = useState<string | null>(loadLastBook());
  const [manifest, setManifest] = useState<string[]>([]);
  const [bookType, setBookType] = useState<'image' | 'text'>('image');
  const [chapterCount, setChapterCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ocrQueueOpen, setOcrQueueOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocManageOpen, setTocManageOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocGenerating, setTocGenerating] = useState(false);
  const [tocSaving, setTocSaving] = useState(false);
  const [chapterGeneratingIndex, setChapterGeneratingIndex] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapterNumber, setEditorChapterNumber] = useState<number | null>(null);
  const [chapterViewRefresh, setChapterViewRefresh] = useState(0);
  const [firstChapterParagraph, setFirstChapterParagraph] = useState<{
    fullText: string;
    startIndex: number;
    key: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'pages' | 'text'>('pages');
  const [streamVoice, setStreamVoice] = useState<StreamVoice>(() => getDefaultStreamVoice());
  const [uploadingChapter, setUploadingChapter] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pendingPageRef = useRef<number | null>(null);
  const pendingAlignTopRef = useRef(false);
  const lastImageRef = useRef<string | null>(null);
  const {
    settings,
    setSettings,
    metrics,
    setMetrics,
    applyZoomMode,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform,
    handleMetricsChange
  } = useZoom(createDefaultSettings());

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { toast, showToast, dismiss } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentImage = manifest[currentPage] ?? null;
  const sortedTocEntries = useMemo(() => {
    return [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [tocEntries]);
  const currentChapterIndex = useMemo(() => {
    if (isTextBook) {
      return navigationCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [currentPage, isTextBook, navigationCount, sortedTocEntries]);
  const currentChapterEntry = useMemo(() => {
    if (isTextBook) {
      return sortedTocEntries.find((entry) => entry.page === currentPage) ?? null;
    }
    return currentChapterIndex !== null ? sortedTocEntries[currentChapterIndex] : null;
  }, [currentChapterIndex, currentPage, isTextBook, sortedTocEntries]);
  const editorChapterTitle = useMemo(() => {
    if (!editorChapterNumber) {
      return currentChapterEntry?.title ?? null;
    }
    return (
      sortedTocEntries.find((entry) => entry.page === editorChapterNumber - 1)?.title ??
      currentChapterEntry?.title ??
      null
    );
  }, [currentChapterEntry, editorChapterNumber, sortedTocEntries]);
  const nextChapterEntry =
    !isTextBook && currentChapterIndex !== null
      ? sortedTocEntries[currentChapterIndex + 1]
      : null;
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
  const chapterRange =
    !isTextBook && currentChapterEntry
      ? { start: currentChapterEntry.page, end: nextChapterEntry?.page ?? manifest.length }
      : null;

  const {
    audioState,
    playAudio,
    resetAudio,
    resetAudioCache,
    stopAudio
  } = useAudioController(currentImage, showToast);
  const { streamState, startStream, stopStream } = useStreamingAudio(showToast);
  const {
    closeTextModal,
    currentText,
    fetchPageText,
    regeneratedText,
    resetTextState,
    setRegeneratedText,
    textLoading,
    textModalOpen,
    toggleTextModal
  } = usePageText(currentImage, showToast);
  const {
    jobs: ocrJobs,
    paused: ocrPaused,
    progress: ocrProgress,
    enqueuePages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  } = useOcrQueue({ manifest, showToast });
  const {
    closePrintModal,
    createPrintPdf,
    openPrintModal,
    printLoading,
    printModalOpen,
    printOptions,
    selectedPrintOption,
    setPrintSelection
  } = usePrintOptions({ bookId, manifest, currentPage, showToast });

  const hotkeys = useMemo(
    () => [
      { keys: 'Arrow keys', action: 'Pan image' },
      { keys: 'PageUp', action: 'Previous page' },
      { keys: 'K', action: 'Previous page' },
      { keys: 'PageDown', action: 'Next page' },
      { keys: 'J', action: 'Next page' },
      { keys: 'Space', action: 'Pan up' },
      { keys: 'Shift + Space', action: 'Pan down' },
      { keys: '+ / =', action: 'Zoom in' },
      { keys: '-', action: 'Zoom out' },
      { keys: '0', action: 'Reset zoom/rotation' },
        { keys: 'W', action: 'Fit width' },
        { keys: 'H', action: 'Fit height' },
        { keys: 'R', action: 'Rotate 90°' },
        { keys: 'I', action: 'Invert colors' },
        { keys: 'X', action: 'Toggle page text' },
      { keys: 'V', action: 'Toggle view mode' },
      { keys: 'P', action: 'Play/Pause audio' },
      { keys: 'S', action: 'Play/Stop stream audio' },
      { keys: 'G', action: 'Focus Go To input' },
      { keys: 'F', action: 'Toggle fullscreen' },
      { keys: 'T', action: 'Open TOC' },
      { keys: 'B', action: 'Open book selector' },
      { keys: 'Esc', action: 'Close dialogs' },
      { keys: 'Shift + /', action: 'Open help' }
      ],
      []
  );

  const renderPage = useCallback(
      (pageIndex: number) => {
        if (navigationCount === 0) {
          return;
        }
        const maxIndex = navigationCount - 1;
        const nextIndex = clamp(pageIndex, 0, maxIndex);
        setCurrentPage(nextIndex);
        pendingAlignTopRef.current = viewMode === 'pages';
        setRegeneratedText(false);
        if (bookId) {
          saveLastPage(bookId, nextIndex);
        }
        resetAudio();
        stopStream();
      },
      [bookId, navigationCount, resetAudio, setRegeneratedText, stopStream, viewMode]
  );

  useEffect(() => {
    if (
      !pendingAlignTopRef.current ||
      !metrics ||
      viewMode !== 'pages' ||
      metrics.naturalHeight === 0 ||
      metrics.scale !== settings.zoom
    ) {
      return;
    }
    const scaledHeight = metrics.naturalHeight * metrics.scale;
    const limitY = Math.max(0, (scaledHeight - metrics.containerHeight) / 2);
    const targetPan = clampPan({ x: 0, y: limitY }, metrics);
    if (settings.pan.x !== targetPan.x || settings.pan.y !== targetPan.y) {
      setSettings((prev) => {
        if (prev.pan.x === targetPan.x && prev.pan.y === targetPan.y) {
          return prev;
        }
        return { ...prev, pan: targetPan };
      });
      return;
    }
    pendingAlignTopRef.current = false;
  }, [metrics, setSettings, settings.pan.x, settings.pan.y, settings.zoom, viewMode]);

  useEffect(() => {
    if (viewMode !== 'pages') {
      lastImageRef.current = currentImage;
      return;
    }
    if (currentImage && lastImageRef.current !== currentImage) {
      pendingAlignTopRef.current = true;
    }
    lastImageRef.current = currentImage;
  }, [currentImage, viewMode]);

  const handleViewModeChange = useCallback(
    (mode: 'pages' | 'text') => {
      if (isTextBook && mode === 'pages') {
        return;
      }
      setViewMode(mode);
    },
    [isTextBook]
  );

  const toggleViewMode = useCallback(() => {
    if (isTextBook) {
      return;
    }
    setViewMode((prev) => (prev === 'pages' ? 'text' : 'pages'));
  }, [isTextBook]);

  const goToChapterIndex = useCallback(
    (index: number) => {
      const entry = sortedTocEntries[index];
      if (!entry) {
        return;
      }
      renderPage(entry.page);
    },
    [renderPage, sortedTocEntries]
  );

  const handlePrev = useCallback(() => {
    if (viewMode === 'text') {
      if (isTextBook) {
        renderPage(currentPage - 1);
        return;
      }
      if (currentChapterIndex === null) {
        renderPage(currentPage - 1);
        return;
      }
      if (currentChapterIndex <= 0) {
        return;
      }
      goToChapterIndex(currentChapterIndex - 1);
      return;
    }
    renderPage(currentPage - 1);
  }, [currentChapterIndex, currentPage, goToChapterIndex, isTextBook, renderPage, viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === 'text') {
      if (isTextBook) {
        renderPage(currentPage + 1);
        return;
      }
      if (currentChapterIndex === null) {
        renderPage(currentPage + 1);
        return;
      }
      if (currentChapterIndex >= sortedTocEntries.length - 1) {
        return;
      }
      goToChapterIndex(currentChapterIndex + 1);
      return;
    }
    renderPage(currentPage + 1);
  }, [currentChapterIndex, currentPage, goToChapterIndex, isTextBook, renderPage, sortedTocEntries.length, viewMode]);

  const {
    bookmarks,
    bookmarksLoading,
    bookmarksOpen,
    closeBookmarks,
    handleRemoveBookmarkFromList,
    handleSelectBookmark,
    isBookmarked,
    showBookmarks,
    toggleBookmark
  } = useBookmarks({
    bookId,
    currentImage,
    currentPage,
    renderPage,
    showToast
  });

  const applyFilters = useCallback((filters: Partial<Pick<AppSettings, 'brightness' | 'contrast' | 'invert'>>) => {
    setSettings((prev) => ({
      ...prev,
      ...filters
    }));
  }, []);

  const queueAllPages = useCallback(() => {
    const pages = manifest.map((_, index) => index);
    enqueuePages(pages);
  }, [enqueuePages, manifest]);

  const queueRemainingPages = useCallback(() => {
    const pages = manifest.map((_, index) => index).filter((index) => index >= currentPage);
    enqueuePages(pages);
  }, [currentPage, enqueuePages, manifest]);

  const queueCurrentPage = useCallback(() => {
    if (currentPage >= 0) {
      enqueuePages([currentPage]);
    }
  }, [currentPage, enqueuePages]);

  const ocrQueueState = useMemo(
    () => ({
      total: ocrProgress.total,
      processed: ocrProgress.processed,
      failed: ocrProgress.failed,
      running: ocrProgress.running,
      paused: ocrPaused
    }),
    [ocrPaused, ocrProgress]
  );

  const loadToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocLoading(true);
    try {
      const data = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc`
      );
      setTocEntries(Array.isArray(data.toc) ? data.toc : []);
    } catch (error) {
      console.error(error);
      showToast('Unable to load table of contents', 'error');
    } finally {
      setTocLoading(false);
    }
  }, [bookId, showToast]);

  const handleGenerateToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocGenerating(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc/generate`,
        { method: 'POST' }
      );
      setTocEntries(Array.isArray(response.toc) ? response.toc : []);
      showToast('Table of contents generated', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to generate table of contents', 'error');
    } finally {
      setTocGenerating(false);
    }
  }, [bookId, showToast]);

  const handleSaveToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocSaving(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toc: tocEntries })
        }
      );
      setTocEntries(Array.isArray(response.toc) ? response.toc : []);
      showToast('Table of contents saved', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to save table of contents', 'error');
    } finally {
      setTocSaving(false);
    }
  }, [bookId, showToast, tocEntries]);

  const handleAddTocEntry = useCallback(() => {
    setTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
  }, [currentPage]);

  const handleRemoveTocEntry = useCallback((index: number) => {
    setTocEntries((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleUpdateTocEntry = useCallback((index: number, next: TocEntry) => {
    setTocEntries((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
  }, []);

  const handleGenerateChapter = useCallback(
    async (index: number) => {
      if (!bookId) {
        return;
      }
      const entry = tocEntries[index];
      if (!entry) {
        showToast('Chapter entry not found', 'error');
        return;
      }
      const pageStart = entry.page;
      const sortedPages = tocEntries
        .map((tocEntry) => tocEntry.page)
        .filter((page) => Number.isInteger(page))
        .sort((a, b) => a - b);
      const chapterNumber = sortedPages.indexOf(pageStart) + 1;
      if (chapterNumber <= 0) {
        showToast('Chapter order could not be determined', 'error');
        return;
      }
      const nextPageCandidates = tocEntries
        .map((tocEntry) => tocEntry.page)
        .filter((page) => Number.isInteger(page) && page > pageStart)
        .sort((a, b) => a - b);
      const pageEnd = nextPageCandidates[0] ?? manifest.length;

      if (pageStart < 0 || pageStart >= manifest.length) {
        showToast('Chapter start page is out of range', 'error');
        return;
      }
      if (!Number.isInteger(pageEnd) || pageEnd <= pageStart || pageEnd > manifest.length) {
        showToast('Chapter end page is invalid', 'error');
        return;
      }

      setChapterGeneratingIndex(index);
      try {
        const result = await fetchJson<{ file: string }>(
          `/api/books/${encodeURIComponent(bookId)}/chapters/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageStart,
              pageEnd,
              chapterNumber
            })
          }
        );
        showToast(`Chapter text saved: ${result.file}`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to generate chapter text', 'error');
      } finally {
        setChapterGeneratingIndex(null);
      }
    },
    [bookId, manifest.length, showToast, tocEntries]
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
    if (!bookId) {
      setManifest([]);
      setBookType('image');
      setChapterCount(0);
      closeBookmarks();
      setStreamVoice(getDefaultStreamVoice());
      return;
    }
    const storedSettings = loadSettingsForBook(bookId);
    setSettings(storedSettings ?? createDefaultSettings());
    const storedVoice = loadStreamVoiceForBook(bookId);
    if (storedVoice && isStreamVoice(storedVoice)) {
      setStreamVoice(storedVoice);
    } else {
      setStreamVoice(getDefaultStreamVoice());
    }
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    resetTextState();
    resetAudioCache();
    setMetrics(null);
    setManifest([]);
    setCurrentPage(0);
    stopAudio();
    stopStream();

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
  }, [bookId, closeBookmarks, resetAudioCache, resetTextState, showToast, stopAudio, stopStream]);

  useEffect(() => {
    resetQueue();
    setOcrQueueOpen(false);
  }, [bookId, resetQueue]);

  useEffect(() => {
    setTocEntries([]);
    setTocOpen(false);
    setTocManageOpen(false);
  }, [bookId]);

  useEffect(() => {
    if (tocOpen || tocManageOpen || viewMode === 'text') {
      void loadToc();
    }
  }, [loadToc, tocManageOpen, tocOpen, viewMode]);

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

  const streamSequenceRef = useRef<{
    chunks: string[];
    index: number;
    baseKey: string;
  } | null>(null);
  const pendingStreamSequenceRef = useRef<{
    fullText: string;
    startIndex: number;
    baseKey: string;
  } | null>(null);
  const [streamSequenceActive, setStreamSequenceActive] = useState(false);

  const stopStreamSequence = useCallback(() => {
    streamSequenceRef.current = null;
    setStreamSequenceActive(false);
  }, []);

  const splitStreamChunks = useCallback((text: string, startIndex: number) => {
    const input = stripMarkdown(text.slice(Math.max(0, startIndex)));
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < input.length) {
      const slice = input.slice(cursor, cursor + STREAM_CHUNK_SIZE);
      if (cursor + STREAM_CHUNK_SIZE >= input.length) {
        chunks.push(slice.trim());
        break;
      }
      const breakWindow = slice.slice(Math.max(0, slice.length - 200));
      let breakIndex = breakWindow.lastIndexOf('\n\n');
      if (breakIndex === -1) {
        breakIndex = breakWindow.lastIndexOf('\n');
      }
      if (breakIndex === -1) {
        breakIndex = breakWindow.lastIndexOf(' ');
      }
      if (breakIndex === -1) {
        breakIndex = slice.length;
      } else {
        breakIndex += Math.max(0, slice.length - 200);
      }
      const chunk = input.slice(cursor, cursor + breakIndex);
      chunks.push(chunk.trim());
      cursor += Math.max(1, breakIndex);
    }
    return chunks.filter((chunk) => chunk.length > 0);
  }, []);

  const startStreamSequence = useCallback(
    async (fullText: string, startIndex: number, baseKey: string) => {
      if (streamState.status === 'connecting' || streamState.status === 'streaming') {
        pendingStreamSequenceRef.current = { fullText, startIndex, baseKey };
        stopStream();
        stopStreamSequence();
        return;
      }
      const chunks = splitStreamChunks(fullText, startIndex);
      if (chunks.length === 0) {
        showToast('No text available to stream', 'error');
        return;
      }
      stopAudio();
      stopStream();
      stopStreamSequence();
      streamSequenceRef.current = { chunks, index: 0, baseKey };
      setStreamSequenceActive(true);
      await startStream({ text: chunks[0], pageKey: `${baseKey}#chunk-0`, voice: streamVoice });
    },
    [
      showToast,
      splitStreamChunks,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      streamState.status,
      streamVoice
    ]
  );

  const handlePlayStream = useCallback(async () => {
    if (isTextBook) {
      if (!bookId || chapterCount === 0) {
        showToast('No chapter available to stream', 'error');
        return;
      }
      if (!firstChapterParagraph) {
        showToast('No chapter text available to stream', 'error');
        return;
      }
      await startStreamSequence(
        firstChapterParagraph.fullText,
        firstChapterParagraph.startIndex,
        firstChapterParagraph.key
      );
      return;
    }
    if (!currentImage) {
      return;
    }
    const pageText = currentText ?? (await fetchPageText());
    const textValue = stripMarkdown(pageText?.text || '');
    if (!textValue) {
      showToast('No page text available to stream', 'error');
      return;
    }
    stopAudio();
    stopStreamSequence();
    await startStream({ text: textValue, pageKey: currentImage, voice: streamVoice });
  }, [
    isTextBook,
    bookId,
    chapterCount,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    showToast,
    startStream,
    startStreamSequence,
    stopAudio,
    stopStreamSequence,
    streamVoice
  ]);


  const handlePlayChapterParagraph = useCallback(
    async (payload: { fullText: string; startIndex: number; key: string }) => {
      const trimmed = payload.fullText.trim();
      if (!trimmed) {
        showToast('No paragraph text available to stream', 'error');
        return;
      }
      await startStreamSequence(payload.fullText, payload.startIndex, payload.key);
    },
    [showToast, startStreamSequence]
  );

  const handleCopyText = useCallback(async () => {
    if (!currentImage) {
      showToast('No page selected', 'error');
      return;
    }
    const pageText = currentText ?? (await fetchPageText());
    const textValue = (pageText?.text || '').trim();
    if (!textValue) {
      showToast('No OCR text available to copy', 'error');
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textValue);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textValue;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy failed');
        }
      }
      showToast('Copied OCR text to clipboard', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to copy text', 'error');
    }
  }, [currentImage, currentText, fetchPageText, showToast]);

  const handleStreamVoiceChange = useCallback(
    (voice: string) => {
      if (isStreamVoice(voice)) {
        setStreamVoice(voice);
      }
    },
    []
  );

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
        setTocEntries(Array.isArray(data.toc) ? data.toc : []);
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
    [bookId, bookType, books, showToast]
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
        setTocEntries(Array.isArray(data.toc) ? data.toc : []);
        setCurrentPage(Number.isInteger(data.chapterIndex) ? (data.chapterIndex as number) : 0);
        setEditorChapterNumber(
          Number.isInteger(data.chapterIndex) ? (data.chapterIndex as number) + 1 : null
        );
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
    [bookId, bookType, books, showToast]
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
        setTocEntries([]);
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
    [showToast]
  );

  const handleStopStream = useCallback(() => {
    stopStream();
    stopStreamSequence();
  }, [stopStream, stopStreamSequence]);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openBookModal = useCallback(() => setBookModalOpen(true), []);
  const closeBookModal = useCallback(() => setBookModalOpen(false), []);
  const applyZoomModeWithAlign = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      applyZoomMode(mode);
      if (viewMode === 'pages') {
        pendingAlignTopRef.current = true;
      }
    },
    [applyZoomMode, viewMode]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (
          textModalOpen ||
          helpOpen ||
          printModalOpen ||
          bookmarksOpen ||
          bookModalOpen ||
          ocrQueueOpen ||
          tocOpen ||
          tocManageOpen
        ) &&
        event.key !== 'Escape'
      ) {
        return;
      }
      if (isTextInput(event.target) && event.key !== 'Escape') {
        return;
      }
      const key = event.key.toLowerCase();
      switch (key) {
        case '?':
          event.preventDefault();
          setHelpOpen(true);
          break;
        case 'arrowleft':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x + PAN_STEP, y: settings.pan.y });
          break;
        case 'arrowright':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x - PAN_STEP, y: settings.pan.y });
          break;
        case 'arrowup':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x, y: settings.pan.y + PAN_STEP });
          break;
        case 'arrowdown':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x, y: settings.pan.y - PAN_STEP });
          break;
        case 'pageup':
        case 'k':
          event.preventDefault();
          handlePrev();
          break;
        case 'pagedown':
        case 'j':
          event.preventDefault();
          handleNext();
          break;
        case ' ':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({
            x: settings.pan.x,
            y: settings.pan.y + (event.shiftKey ? PAN_PAGE_STEP : -PAN_PAGE_STEP)
          });
          break;
        case '+':
        case '=':
          event.preventDefault();
          updateZoom(settings.zoom + ZOOM_STEP);
          break;
        case '-':
          event.preventDefault();
          updateZoom(settings.zoom - ZOOM_STEP);
          break;
        case '0':
          event.preventDefault();
          resetTransform();
          break;
        case 'w':
          event.preventDefault();
          applyZoomModeWithAlign('fit-width');
          break;
        case 'h':
          event.preventDefault();
          applyZoomModeWithAlign('fit-height');
          break;
        case 'r':
          event.preventDefault();
          updateRotation();
          break;
        case 'i':
          event.preventDefault();
          applyFilters({ invert: !settings.invert });
          break;
        case 'x':
          event.preventDefault();
          toggleTextModal();
          break;
        case 'v':
          event.preventDefault();
          toggleViewMode();
          break;
        case 'p':
          event.preventDefault();
          if (audioState.status === 'playing') {
            stopAudio();
          } else {
            stopStream();
            void playAudio();
          }
          break;
        case 's':
          event.preventDefault();
          if (streamState.status === 'streaming' || streamState.status === 'connecting') {
            handleStopStream();
          } else {
            void handlePlayStream();
          }
          break;
        case 'g':
          event.preventDefault();
          gotoInputRef.current?.focus();
          break;
        case 't':
          event.preventDefault();
          setTocOpen(true);
          break;
        case 'b':
          event.preventDefault();
          openBookModal();
          break;
        case 'f':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'escape':
          if (textModalOpen) {
            closeTextModal();
          }
          if (bookModalOpen) {
            closeBookModal();
          }
          if (ocrQueueOpen) {
            setOcrQueueOpen(false);
          }
          if (tocOpen) {
            setTocOpen(false);
          }
          if (tocManageOpen) {
            setTocManageOpen(false);
          }
          if (helpOpen) {
            setHelpOpen(false);
          }
          if (printModalOpen) {
            closePrintModal();
          }
          if (bookmarksOpen) {
            closeBookmarks();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    applyFilters,
    applyZoomModeWithAlign,
    audioState.status,
    playAudio,
    resetTransform,
    updatePan,
    settings.invert,
    settings.pan.x,
    settings.pan.y,
    settings.zoom,
    stopAudio,
    stopStream,
    stopStreamSequence,
    handlePlayStream,
    handleStopStream,
    closeTextModal,
    textModalOpen,
    updateRotation,
    updateZoom,
    toggleFullscreen,
    handleNext,
    handlePrev,
    toggleViewMode,
    bookModalOpen,
    closeBookModal,
    openBookModal,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    closeBookmarks,
    closePrintModal,
    ocrQueueOpen,
    streamState.status,
    viewMode,
    currentImage,
    tocOpen,
    tocManageOpen
  ]);

  useEffect(() => {
    if (!streamSequenceActive || streamState.status !== 'idle') {
      return;
    }
    const sequence = streamSequenceRef.current;
    if (!sequence) {
      setStreamSequenceActive(false);
      return;
    }
    if (sequence.index >= sequence.chunks.length - 1) {
      stopStreamSequence();
      return;
    }
    sequence.index += 1;
    void startStream({
      text: sequence.chunks[sequence.index],
      pageKey: `${sequence.baseKey}#chunk-${sequence.index}`,
      voice: streamVoice
    });
  }, [startStream, stopStreamSequence, streamSequenceActive, streamState.status, streamVoice]);

  useEffect(() => {
    if (streamState.status !== 'idle') {
      return;
    }
    const pending = pendingStreamSequenceRef.current;
    if (!pending) {
      return;
    }
    pendingStreamSequenceRef.current = null;
    void startStreamSequence(pending.fullText, pending.startIndex, pending.baseKey);
  }, [startStreamSequence, streamState.status]);
  const hasBooks = books.length > 0;
  const footerMessage =
    viewMode === 'text'
      ? chapterNumber && currentChapterEntry
        ? `Chapter ${chapterNumber}: ${currentChapterEntry.title}`
        : hasBooks
        ? 'Open the TOC to create chapters for text view.'
        : 'No books found. Add files to /data to begin.'
      : currentImage
      ? currentImage
      : hasBooks
      ? 'Choose a book to begin reading.'
      : 'No books found. Add files to /data to begin.';

  return (
      <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
        <aside className="sidebar">
          <Toolbar
              currentBook={bookId}
              manifestLength={navigationCount}
              currentPage={currentPage}
              viewMode={viewMode}
              disablePagesMode={isTextBook}
              disableImageActions={isTextBook}
              onViewModeChange={handleViewModeChange}
              onOpenBookModal={openBookModal}
              onPrev={handlePrev}
              onNext={handleNext}
              onGoTo={(page) => renderPage(page)}
              onZoomIn={() => updateZoom(settings.zoom + ZOOM_STEP)}
              onZoomOut={() => updateZoom(settings.zoom - ZOOM_STEP)}
              onResetZoom={resetTransform}
              onFitWidth={() => applyZoomModeWithAlign('fit-width')}
              onFitHeight={() => applyZoomModeWithAlign('fit-height')}
              onRotate={updateRotation}
              onInvert={() => applyFilters({ invert: !settings.invert })}
              invert={settings.invert}
              zoom={settings.zoom}
              rotation={settings.rotation}
              brightness={settings.brightness}
              contrast={settings.contrast}
              onBrightness={(value) => applyFilters({ brightness: value })}
              onContrast={(value) => applyFilters({ contrast: value })}
              onToggleTextModal={() => {
                toggleTextModal();
              }}
              onCopyText={handleCopyText}
              onToggleFullscreen={() => void toggleFullscreen()}
              fullscreen={isFullscreen}
              audioState={audioState}
              onPlayAudio={() => {
                stopStream();
                void playAudio();
              }}
              onStopAudio={stopAudio}
              streamState={streamState}
              streamVoice={streamVoice}
              streamVoiceOptions={STREAM_VOICE_OPTIONS}
              onStreamVoiceChange={handleStreamVoiceChange}
              onPlayStream={() => void handlePlayStream()}
              onStopStream={handleStopStream}
              onCreateChapter={() => {
                if (!isTextBook) {
                  showToast('Select a text book to add chapters', 'error');
                  return;
                }
                void handleCreateChapter({ bookName: '', chapterTitle: '' });
              }}
              gotoInputRef={gotoInputRef}
              onToggleBookmark={toggleBookmark}
              onShowBookmarks={showBookmarks}
              isBookmarked={isBookmarked}
              bookmarksCount={bookmarks.length}
              onOpenPrint={openPrintModal}
              onOpenHelp={openHelp}
              onOpenOcrQueue={() => setOcrQueueOpen(true)}
              onOpenToc={() => setTocOpen(true)}
              onOpenTocManage={() => setTocManageOpen(true)}
              ocrQueueTotal={ocrQueueState.total}
              ocrQueueProcessed={ocrQueueState.processed}
              ocrQueueFailed={ocrQueueState.failed}
              ocrQueueRunning={ocrQueueState.running}
              ocrQueuePaused={ocrQueueState.paused}
          />
        </aside>
        <main className="main">
          <div
            ref={viewerShellRef}
            className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''} ${
              viewMode === 'text' ? 'viewer-shell-text' : ''
            }`}
          >
            {viewMode === 'pages' ? (
              <Viewer
                  imageUrl={currentImage}
                  settings={settings}
                  onPan={updatePan}
                  onMetricsChange={handleMetricsChange}
                  rotation={settings.rotation}
              />
            ) : editorOpen ? (
              <ChapterEditor
                  bookId={bookId}
                  chapterNumber={editorChapterNumber ?? chapterNumber}
                  chapterTitle={editorChapterTitle}
                  onClose={() => {
                    setEditorOpen(false);
                    setEditorChapterNumber(null);
                  }}
                  onSaved={(nextToc) => {
                    if (nextToc) {
                      setTocEntries(nextToc);
                    }
                    setEditorOpen(false);
                    setEditorChapterNumber(null);
                    setChapterViewRefresh((prev) => prev + 1);
                  }}
              />
            ) : (
              <ChapterViewer
                  bookId={bookId}
                  chapterNumber={chapterNumber}
                  chapterTitle={currentChapterEntry?.title ?? null}
                  pageRange={chapterRange}
                  tocLoading={tocLoading}
                  allowGenerate={!isTextBook}
                  allowEdit={isTextBook}
                  onEditChapter={() => {
                    setEditorChapterNumber(chapterNumber);
                    setEditorOpen(true);
                  }}
                  refreshToken={chapterViewRefresh}
                  onFirstParagraphReady={setFirstChapterParagraph}
                  onPlayParagraph={handlePlayChapterParagraph}
              />
            )}
            {loading && <div className="viewer-status">Loading…</div>}
          </div>
          <div className="page-footer">
            <span className="page-path">{footerMessage}</span>
          </div>
        </main>
        <Toast toast={toast} onDismiss={dismiss} />
        <PrintModal
            open={printModalOpen}
            options={printOptions}
            selectedId={selectedPrintOption?.id ?? null}
            onSelect={setPrintSelection}
            onClose={closePrintModal}
            onConfirm={() => void createPrintPdf()}
            loading={printLoading}
        />
        <BookSelectModal
            open={bookModalOpen}
            books={books}
            currentBook={bookId}
            onSelect={(nextBook) => {
              setBookId(nextBook);
              saveLastBook(nextBook);
              closeBookModal();
            }}
            onDelete={handleDeleteBook}
            onUploadChapter={handleUploadChapter}
            uploadingChapter={uploadingChapter}
            onUploadPdf={handleUploadPdf}
            uploadingPdf={uploadingPdf}
            onClose={closeBookModal}
        />
        <HelpModal open={helpOpen} hotkeys={hotkeys} onClose={closeHelp} />
        <BookmarksModal
            open={bookmarksOpen}
            bookmarks={bookmarks}
            loading={bookmarksLoading}
            currentBook={bookId}
            currentPage={currentPage}
            onClose={closeBookmarks}
            onSelect={handleSelectBookmark}
            onRemove={handleRemoveBookmarkFromList}
        />
        <TextModal
            open={textModalOpen}
            text={currentText}
            loading={textLoading}
            onClose={closeTextModal}
            title={currentImage ?? 'Page text'}
            onRegenerate={() => {
              setRegeneratedText(true);
              void fetchPageText(true);
            }}
            regenerated={regeneratedText}
        />
        <TocNavModal
            open={tocOpen}
            entries={tocEntries}
            loading={tocLoading}
            onClose={() => setTocOpen(false)}
            onGoToPage={(pageIndex) => {
              setTocOpen(false);
              renderPage(pageIndex);
            }}
        />
        <TocModal
            open={tocManageOpen}
            entries={tocEntries}
            loading={tocLoading}
            generating={tocGenerating}
            saving={tocSaving}
            manifestLength={isTextBook ? chapterCount : manifest.length}
            chapterGeneratingIndex={chapterGeneratingIndex}
            allowGenerate={!isTextBook}
            onClose={() => setTocManageOpen(false)}
            onGenerate={handleGenerateToc}
            onSave={handleSaveToc}
            onAddEntry={handleAddTocEntry}
            onRemoveEntry={handleRemoveTocEntry}
            onUpdateEntry={handleUpdateTocEntry}
            onGenerateChapter={handleGenerateChapter}
        />
        <OcrQueueModal
            open={ocrQueueOpen}
            onClose={() => setOcrQueueOpen(false)}
            jobs={ocrJobs}
            paused={ocrPaused}
            onTogglePause={togglePause}
            onQueueAll={queueAllPages}
            onQueueRemaining={queueRemainingPages}
            onQueueCurrent={queueCurrentPage}
            onRetryFailed={retryFailed}
            onClearQueue={clearQueue}
        />
      </div>
  );
}
