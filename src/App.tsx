import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toolbar from '@/components/Toolbar';
import Viewer from '@/components/Viewer';
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
import { clamp } from '@/lib/math';
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
const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

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
  const [streamVoice, setStreamVoice] = useState<StreamVoice>(() => getDefaultStreamVoice());
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pendingPageRef = useRef<number | null>(null);
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
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

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
        stopStream();
      },
      [bookId, manifest.length, resetAudio, setRegeneratedText, stopStream]
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
    if (tocOpen || tocManageOpen) {
      void loadToc();
    }
  }, [loadToc, tocManageOpen, tocOpen]);

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

  const handlePlayStream = useCallback(async () => {
    if (!currentImage) {
      return;
    }
    const pageText = currentText ?? (await fetchPageText());
    const textValue = (pageText?.narrationText || pageText?.text || '').trim();
    if (!textValue) {
      showToast('No page text available to stream', 'error');
      return;
    }
    stopAudio();
    await startStream({ text: textValue, pageKey: currentImage, voice: streamVoice });
  }, [currentImage, currentText, fetchPageText, showToast, startStream, stopAudio, streamVoice]);

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

  const handleTriggerPdfUpload = useCallback(() => {
    pdfInputRef.current?.click();
  }, []);

  const handlePdfSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
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
        setManifest(Array.isArray(data.manifest) ? data.manifest : []);
        setCurrentPage(0);
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
  }, [stopStream]);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openBookModal = useCallback(() => setBookModalOpen(true), []);
  const closeBookModal = useCallback(() => setBookModalOpen(false), []);

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
            stopStream();
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
    applyZoomMode,
    audioState.status,
    currentPage,
    playAudio,
    renderPage,
    resetTransform,
    settings.invert,
    settings.zoom,
    stopAudio,
    stopStream,
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
    closePrintModal,
    ocrQueueOpen,
    tocOpen,
    tocManageOpen
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
          <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handlePdfSelected}
          />
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
              onUploadPdf={handleTriggerPdfUpload}
              uploadingPdf={uploadingPdf}
              onPlayStream={() => void handlePlayStream()}
              onStopStream={handleStopStream}
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
            manifestLength={manifest.length}
            onClose={() => setTocManageOpen(false)}
            onGenerate={handleGenerateToc}
            onSave={handleSaveToc}
            onAddEntry={handleAddTocEntry}
            onRemoveEntry={handleRemoveTocEntry}
            onUpdateEntry={handleUpdateTocEntry}
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
