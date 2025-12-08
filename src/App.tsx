import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '@/components/Toolbar';
import Viewer from '@/components/Viewer';
import Toast from '@/components/Toast';
import TextModal from '@/components/TextModal';
import BookmarksModal from '@/components/BookmarksModal';
import PrintModal from '@/components/PrintModal';
import HelpModal from '@/components/HelpModal';
import BookSelectModal from '@/components/BookSelectModal';
import { useToast } from '@/hooks/useToast';
import { useFullscreen } from '@/hooks/useFullscreen';
import { clamp, clampPan } from '@/lib/math';
import {
  loadLastBook,
  loadLastPage,
  loadSettingsForBook,
  saveLastBook,
  saveLastPage,
  saveSettingsForBook
} from '@/lib/storage';
import { deriveAudioUrl, deriveTextUrl } from '@/lib/paths';
import type {
  AppSettings,
  AudioCacheEntry,
  AudioState,
  PageText,
  ViewerMetrics,
  ViewerPan,
  ZoomMode,
  Bookmark
} from '@/types/app';

const DEFAULT_SETTINGS: AppSettings = {
  zoom: 1,
  zoomMode: 'fit-width',
  rotation: 0,
  invert: false,
  brightness: 100,
  contrast: 100,
  pan: { x: 0, y: 0 }
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.15;

function createDefaultSettings(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
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
  const [currentPage, setCurrentPage] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings);
  const [metrics, setMetrics] = useState<ViewerMetrics | null>(null);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textCache, setTextCache] = useState<Record<string, PageText>>({});
  const [textLoading, setTextLoading] = useState(false);
  const [regeneratedText, setRegeneratedText] = useState(false);
  const [audioCache, setAudioCache] = useState<Record<string, AudioCacheEntry>>({});
  const [audioState, setAudioState] = useState<AudioState>({
    status: 'idle',
    url: null,
    source: null,
    currentPageKey: null
  });
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printSelection, setPrintSelection] = useState<string>('current');
  const [printLoading, setPrintLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pendingPageRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { toast, showToast, dismiss } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const currentImage = manifest[currentPage] ?? null;

  const hotkeys = useMemo(
    () => [
      { keys: '← / ↑ / PageUp', action: 'Previous page' },
      { keys: '→ / ↓ / PageDown / Space', action: 'Next page' },
      { keys: '+ / =', action: 'Zoom in' },
      { keys: '-', action: 'Zoom out' },
      { keys: '0', action: 'Reset zoom/rotation' },
      { keys: 'W', action: 'Fit width' },
      { keys: 'H', action: 'Fit height' },
      { keys: 'R', action: 'Rotate 90°' },
      { keys: 'I', action: 'Invert colors' },
      { keys: 'X', action: 'Toggle page text' },
      { keys: 'P', action: 'Play/Pause narration' },
      { keys: 'G', action: 'Focus Go To input' },
      { keys: 'F', action: 'Toggle fullscreen' },
      { keys: 'B', action: 'Open book selector' },
      { keys: 'Esc', action: 'Close dialogs' },
      { keys: 'Shift + /', action: 'Open help' }
    ],
    []
  );

  const renderPage = useCallback(
    (pageIndex: number) => {
      if (manifest.length === 0) {
        return;
      }
      const maxIndex = manifest.length - 1;
      const nextIndex = clamp(pageIndex, 0, maxIndex);
      setCurrentPage(nextIndex);
      setSettings((prev) => ({
        ...prev,
        pan: { x: 0, y: 0 }
      }));
      setRegeneratedText(false);
      if (bookId) {
        saveLastPage(bookId, nextIndex);
      }
      setAudioState((prev) => ({
        ...prev,
        status: 'idle',
        url: null,
        source: null,
        currentPageKey: null,
        error: undefined
      }));
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    },
    [bookId, manifest.length]
  );

  const updateTransform = useCallback(
    (partial: Partial<Pick<AppSettings, 'zoom' | 'zoomMode' | 'rotation' | 'pan'>>) => {
      setSettings((prev) => {
        const requestedZoom = partial.zoom ?? prev.zoom;
        const clampedZoom = clamp(requestedZoom, ZOOM_MIN, ZOOM_MAX);
        const nextZoomMode = partial.zoomMode ?? prev.zoomMode;
        const basePan = partial.pan ?? prev.pan;
        const panMetrics = metrics ? { ...metrics, scale: clampedZoom } : null;
        const nextPan = panMetrics ? clampPan(basePan, panMetrics) : basePan;
        const rotation = partial.rotation ?? prev.rotation;

        if (
          clampedZoom === prev.zoom &&
          nextZoomMode === prev.zoomMode &&
          rotation === prev.rotation &&
          nextPan.x === prev.pan.x &&
          nextPan.y === prev.pan.y
        ) {
          return prev;
        }

        return {
          ...prev,
          ...partial,
          zoom: clampedZoom,
          zoomMode: nextZoomMode,
          rotation,
          pan: nextPan
        };
      });
    },
    [metrics]
  );

  const applyZoomMode = useCallback(
    (mode: ZoomMode, overrideMetrics?: ViewerMetrics | null) => {
      const targetMetrics = overrideMetrics ?? metrics;
      if (!targetMetrics || targetMetrics.naturalWidth === 0 || targetMetrics.naturalHeight === 0) {
        updateTransform({ zoomMode: mode, pan: { x: 0, y: 0 } });
        return;
      }

      const rotation = Math.abs(settings.rotation % 360);
      const rotated = rotation === 90 || rotation === 270;
      const naturalWidth = rotated ? targetMetrics.naturalHeight : targetMetrics.naturalWidth;
      const naturalHeight = rotated ? targetMetrics.naturalWidth : targetMetrics.naturalHeight;

      let nextZoom = settings.zoom;
      if (mode === 'fit-width' && naturalWidth > 0) {
        nextZoom = targetMetrics.containerWidth / naturalWidth;
      } else if (mode === 'fit-height' && naturalHeight > 0) {
        nextZoom = targetMetrics.containerHeight / naturalHeight;
      }

      if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
        nextZoom = 1;
      }

      updateTransform({ zoom: nextZoom, zoomMode: mode, pan: { x: 0, y: 0 } });
    },
    [metrics, settings.rotation, settings.zoom, updateTransform]
  );

  const updateZoom = useCallback(
    (nextZoom: number, mode: ZoomMode = 'custom') => {
      updateTransform({ zoom: nextZoom, zoomMode: mode });
    },
    [updateTransform]
  );

  const updateRotation = useCallback(() => {
    const nextRotation = (settings.rotation + 90) % 360;
    updateTransform({ rotation: nextRotation, pan: { x: 0, y: 0 } });
  }, [settings.rotation, updateTransform]);

  const updatePan = useCallback(
    (nextPan: ViewerPan) => {
      updateTransform({ pan: nextPan });
    },
    [updateTransform]
  );

  const applyFilters = useCallback((filters: Partial<Pick<AppSettings, 'brightness' | 'contrast' | 'invert'>>) => {
    setSettings((prev) => ({
      ...prev,
      ...filters
    }));
  }, []);

  const resetTransform = useCallback(() => {
    updateTransform({ zoom: 1, zoomMode: 'custom', rotation: 0, pan: { x: 0, y: 0 } });
  }, [updateTransform]);

  const handleMetricsChange = useCallback((nextMetrics: ViewerMetrics) => {
    setMetrics(nextMetrics);
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setAudioState((prev) => ({
      ...prev,
      status: 'idle',
      source: null,
      currentPageKey: null
    }));
  }, []);

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

  const fetchPageText = useCallback(
    async (force = false) => {
      if (!currentImage) {
        return;
      }
      const cached = textCache[currentImage];
      if (cached && !force) {
        return;
      }

      setTextLoading(true);
      try {
        if (!force) {
          const directUrl = deriveTextUrl(currentImage);
          try {
            const response = await fetch(directUrl);
            if (response.ok) {
              const text = await response.text();
              const entry: PageText = { text, source: 'file' };
              setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
              setRegeneratedText(false);
              return;
            }
          } catch {
            // fall back to API
          }
        }

        const params = new URLSearchParams({ image: currentImage });
        if (force) {
          params.set('skipCache', '1');
        }
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(`/api/page-text?${params.toString()}`);
        const entry: PageText = { text: data.text, source: data.source };
        setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
        setRegeneratedText(data.source === 'ai' || force);
        showToast(`Page text ${data.source === 'ai' ? 'generated' : 'loaded'}`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to load page text', 'error');
      } finally {
        setTextLoading(false);
      }
    },
    [currentImage, showToast, textCache]
  );

  const playAudio = useCallback(async () => {
    if (!currentImage) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (
      audioState.currentPageKey === currentImage &&
      (audioState.status === 'loading' || audioState.status === 'generating')
    ) {
      showToast('Narration is already in progress…', 'info');
      return;
    }
    setAudioState((prev) => ({
      ...prev,
      status: 'loading',
      error: undefined,
      source: null,
      currentPageKey: currentImage
    }));
    try {
      let entry = audioCache[currentImage];
      if (!entry) {
        const directUrl = deriveAudioUrl(currentImage);
        try {
          const headResponse = await fetch(directUrl, { method: 'HEAD' });
          if (headResponse.ok) {
            entry = { url: directUrl, source: 'file' };
          }
        } catch {
          // try API
        }
      }

      if (!entry) {
        const requestBody = {
          image: currentImage
        };
        setAudioState((prev) => ({
          ...prev,
          status: 'generating',
          error: undefined,
          source: null,
          currentPageKey: currentImage
        }));
        showToast('Generating narration…', 'info');
        const response = await fetch('/api/page-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          throw new Error('Failed to generate audio');
        }
        const data = (await response.json()) as AudioCacheEntry;
        entry = data;
      }

      if (!entry?.url) {
        throw new Error('Audio URL missing');
      }

      setAudioCache((prev) => ({ ...prev, [currentImage]: entry! }));
      if (audio.src !== entry.url) {
        audio.src = entry.url;
      }
      await audio.play();
      setAudioState((prev) => ({
        ...prev,
        url: entry!.url,
        status: 'playing',
        source: entry!.source,
        currentPageKey: currentImage
      }));
      showToast(`Playing narration (${entry.source})`, 'info');
    } catch (error) {
      console.error(error);
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        source: null,
        error: 'Unable to play audio'
      }));
      showToast('Unable to play audio', 'error');
    }
  }, [audioCache, audioState, currentImage, showToast]);

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
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handlePlay = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'playing'
      }));
    };
    const handlePause = () => {
      setAudioState((prev) => ({
        ...prev,
        status: audio.ended ? 'idle' : 'paused'
      }));
    };
    const handleEnded = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'idle',
        source: null
      }));
    };
    const handleError = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        source: null,
        error: 'Playback failed'
      }));
      showToast('Audio playback failed', 'error');
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [showToast]);

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
      setBookmarks([]);
      setBookmarksOpen(false);
      return;
    }
    const storedSettings = loadSettingsForBook(bookId);
    setSettings(storedSettings ?? createDefaultSettings());
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    setTextCache({});
    setAudioCache({});
    setMetrics(null);
    setManifest([]);
    setCurrentPage(0);
    stopAudio();

    (async () => {
      try {
        const data = await fetchJson<{ book: string; manifest: string[] }>(
          `/api/books/${encodeURIComponent(bookId)}/manifest`
        );
        setManifest(data.manifest);
        const storedPage = loadLastPage(bookId);
        const requestedPage = storedPage ?? pendingPageRef.current ?? 0;
        if (data.manifest.length > 0) {
          const safePage = clamp(requestedPage, 0, data.manifest.length - 1);
          setCurrentPage(safePage);
          pendingPageRef.current = null;
        } else {
          setCurrentPage(0);
        }
        showToast(`Loaded ${data.manifest.length} pages`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to load book manifest', 'error');
        setManifest([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId, showToast, stopAudio]);

  useEffect(() => {
    if (!bookId) {
      setBookmarks([]);
      return;
    }
    void fetchBookmarks(bookId);
  }, [bookId, fetchBookmarks]);

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
    if (!metrics) {
      return;
    }
    if (settings.zoomMode === 'custom') {
      return;
    }
    applyZoomMode(settings.zoomMode, metrics);
  }, [applyZoomMode, metrics, settings.zoomMode]);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openBookModal = useCallback(() => setBookModalOpen(true), []);
  const closeBookModal = useCallback(() => setBookModalOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((textModalOpen || helpOpen || printModalOpen || bookmarksOpen || bookModalOpen) && event.key !== 'Escape') {
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
        case 'arrowup':
        case 'pageup':
          event.preventDefault();
          renderPage(currentPage - 1);
          break;
        case 'arrowright':
        case 'arrowdown':
        case 'pagedown':
        case ' ':
          event.preventDefault();
          renderPage(currentPage + 1);
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
          applyZoomMode('fit-width');
          break;
        case 'h':
          event.preventDefault();
          applyZoomMode('fit-height');
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
          setTextModalOpen((prev) => {
            const next = !prev;
            if (!prev) {
              void fetchPageText();
            }
            return next;
          });
          break;
        case 'p':
          event.preventDefault();
          if (audioState.status === 'playing') {
            stopAudio();
          } else {
            void playAudio();
          }
          break;
        case 'g':
          event.preventDefault();
          gotoInputRef.current?.focus();
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
            setTextModalOpen(false);
          }
          if (bookModalOpen) {
            closeBookModal();
          }
          if (helpOpen) {
            setHelpOpen(false);
          }
          if (printModalOpen) {
            setPrintModalOpen(false);
          }
          if (bookmarksOpen) {
            setBookmarksOpen(false);
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
    applyZoomMode,
    audioState.status,
    currentPage,
    playAudio,
    renderPage,
    resetTransform,
    settings.invert,
    settings.zoom,
    stopAudio,
    textModalOpen,
    updateRotation,
    updateZoom,
    fetchPageText,
    toggleFullscreen,
    bookModalOpen,
    closeBookModal,
    openBookModal,
    helpOpen,
    printModalOpen,
    bookmarksOpen
  ]);

  const currentText = currentImage ? textCache[currentImage] ?? null : null;
  const isBookmarked = bookmarks.some((entry) => entry.page === currentPage);
  const printOptions = useMemo(() => {
    const options: { id: string; label: string; detail: string; pages: number[] }[] = [];
    const lastIndex = manifest.length - 1;
    if (manifest.length > 0) {
      options.push({
        id: 'current',
        label: 'Current page',
        detail: `Page ${currentPage + 1}`,
        pages: [currentPage]
      });
    }
    if (currentPage > 0) {
      options.push({
        id: 'prev-current',
        label: 'Previous + current',
        detail: `Pages ${currentPage}–${currentPage + 1}`,
        pages: [currentPage - 1, currentPage]
      });
    }
    if (currentPage < lastIndex && manifest.length > 0) {
      options.push({
        id: 'current-next',
        label: 'Current + next',
        detail: `Pages ${currentPage + 1}–${currentPage + 2}`,
        pages: [currentPage, currentPage + 1]
      });
    }
    if (currentPage > 0 && currentPage < lastIndex) {
      options.push({
        id: 'prev-current-next',
        label: 'Previous, current, next',
        detail: `Pages ${currentPage}–${currentPage + 2}`,
        pages: [currentPage - 1, currentPage, currentPage + 1]
      });
    }
    return options;
  }, [currentPage, manifest.length]);
  const selectedPrintOption =
    printOptions.find((option) => option.id === printSelection) ?? printOptions[0] ?? null;
  const hasBooks = books.length > 0;
  const footerMessage = currentImage
    ? currentImage
    : hasBooks
    ? 'Choose a book to begin reading.'
    : 'No books found. Add files to /data to begin.';

  const openPrintModal = useCallback(() => {
    setPrintModalOpen(true);
    if (selectedPrintOption) {
      setPrintSelection(selectedPrintOption.id);
    }
  }, [selectedPrintOption]);

  const closePrintModal = useCallback(() => {
    setPrintModalOpen(false);
  }, []);

  const createPrintPdf = useCallback(async () => {
    if (!bookId || !selectedPrintOption) {
      return;
    }
    const pages = selectedPrintOption.pages
      .filter((index) => index >= 0 && index < manifest.length)
      .map((index) => manifest[index]);
    if (pages.length === 0) {
      showToast('No pages available to print', 'error');
      return;
    }
    try {
      setPrintLoading(true);
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages })
      });
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const serverFilename = match?.[1];
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const fallback = `${bookId}-pages-${selectedPrintOption.id}.pdf`;
      const filename = serverFilename || fallback;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast('PDF ready to print', 'success');
      setPrintModalOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Unable to create PDF', 'error');
    } finally {
      setPrintLoading(false);
    }
  }, [bookId, manifest, selectedPrintOption, showToast]);

  useEffect(() => {
    if (printOptions.length === 0) {
      setPrintSelection('current');
      return;
    }
    if (!printOptions.some((option) => option.id === printSelection)) {
      setPrintSelection(printOptions[0].id);
    }
  }, [printOptions, printSelection]);

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <aside className="sidebar">
        <Toolbar
          currentBook={bookId}
          manifestLength={manifest.length}
          currentPage={currentPage}
          onOpenBookModal={openBookModal}
          onPrev={() => renderPage(currentPage - 1)}
          onNext={() => renderPage(currentPage + 1)}
          onGoTo={(page) => renderPage(page)}
          onZoomIn={() => updateZoom(settings.zoom + ZOOM_STEP)}
          onZoomOut={() => updateZoom(settings.zoom - ZOOM_STEP)}
          onResetZoom={resetTransform}
          onFitWidth={() => applyZoomMode('fit-width')}
          onFitHeight={() => applyZoomMode('fit-height')}
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
            setTextModalOpen((prev) => !prev);
            if (!textModalOpen) {
              void fetchPageText();
            }
          }}
          onToggleFullscreen={() => void toggleFullscreen()}
          fullscreen={isFullscreen}
          audioState={audioState}
          onPlayAudio={() => void playAudio()}
          onStopAudio={stopAudio}
          gotoInputRef={gotoInputRef}
          onToggleBookmark={toggleBookmark}
          onShowBookmarks={showBookmarks}
          isBookmarked={isBookmarked}
          bookmarksCount={bookmarks.length}
          onOpenPrint={openPrintModal}
          onOpenHelp={openHelp}
        />
      </aside>
      <main className="main">
        <div ref={viewerShellRef} className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''}`}>
          <Viewer
            imageUrl={currentImage}
            settings={settings}
            onPan={updatePan}
            onMetricsChange={handleMetricsChange}
            rotation={settings.rotation}
          />
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
        onClose={() => setTextModalOpen(false)}
        title={currentImage ?? 'Page text'}
        onRegenerate={() => {
          setRegeneratedText(true);
          void fetchPageText(true);
        }}
        regenerated={regeneratedText}
      />
    </div>
  );
}
