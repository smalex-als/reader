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
import { useAudioController } from '@/hooks/useAudioController';
import { useBookmarks } from '@/hooks/useBookmarks';
import { usePageText } from '@/hooks/usePageText';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { clamp, clampPan } from '@/lib/math';
import {
  loadLastBook,
  loadLastPage,
  loadSettingsForBook,
  saveLastBook,
  saveLastPage,
  saveSettingsForBook
} from '@/lib/storage';
import type { AppSettings, ViewerMetrics, ViewerPan, ZoomMode, Bookmark } from '@/types/app';

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
  const [helpOpen, setHelpOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pendingPageRef = useRef<number | null>(null);

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { toast, showToast, dismiss } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const currentImage = manifest[currentPage] ?? null;

  const {
    audioState,
    playAudio,
    resetAudio,
    resetAudioCache,
    stopAudio
  } = useAudioController(currentImage, showToast);
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
      resetAudio();
    },
    [bookId, manifest.length, resetAudio, setRegeneratedText]
  );

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
      closeBookmarks();
      return;
    }
    const storedSettings = loadSettingsForBook(bookId);
    setSettings(storedSettings ?? createDefaultSettings());
    pendingPageRef.current = loadLastPage(bookId);
    setLoading(true);
    resetTextState();
    resetAudioCache();
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
  }, [bookId, closeBookmarks, resetAudioCache, resetTextState, showToast, stopAudio]);

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
          toggleTextModal();
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
            closeTextModal();
          }
          if (bookModalOpen) {
            closeBookModal();
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
    applyZoomMode,
    audioState.status,
    currentPage,
    playAudio,
    renderPage,
    resetTransform,
    settings.invert,
    settings.zoom,
    stopAudio,
    closeTextModal,
    textModalOpen,
    updateRotation,
    updateZoom,
    toggleFullscreen,
    bookModalOpen,
    closeBookModal,
    openBookModal,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    closeBookmarks,
    closePrintModal
  ]);
  const hasBooks = books.length > 0;
  const footerMessage = currentImage
    ? currentImage
    : hasBooks
    ? 'Choose a book to begin reading.'
    : 'No books found. Add files to /data to begin.';

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
            toggleTextModal();
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
        onClose={closeTextModal}
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
