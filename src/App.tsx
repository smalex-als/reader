import { useCallback, useEffect, useRef, useState } from 'react';
import Toolbar from '@/components/Toolbar';
import Viewer from '@/components/Viewer';
import Toast from '@/components/Toast';
import TextModal from '@/components/TextModal';
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
  ZoomMode
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
    currentPageKey: null
  });
  const [loading, setLoading] = useState(false);
  const pendingPageRef = useRef<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { toast, showToast, dismiss } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const currentImage = manifest[currentPage] ?? null;

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
      currentPageKey: null
    }));
  }, []);

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
        currentPageKey: currentImage
      }));
      showToast(`Playing narration (${entry.source})`, 'info');
    } catch (error) {
      console.error(error);
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        error: 'Unable to play audio'
      }));
      showToast('Unable to play audio', 'error');
    }
  }, [audioCache, audioState, currentImage, showToast]);

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
        status: 'idle'
      }));
    };
    const handleError = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
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
        const requestedPage = pendingPageRef.current ?? 0;
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (textModalOpen && event.key !== 'Escape') {
        return;
      }
      if (isTextInput(event.target) && event.key !== 'Escape') {
        return;
      }
      const key = event.key.toLowerCase();
      switch (key) {
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
        case 'f':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'escape':
          if (textModalOpen) {
            setTextModalOpen(false);
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
    toggleFullscreen
  ]);

  const currentText = currentImage ? textCache[currentImage] ?? null : null;
  const hasBooks = books.length > 0;
  const footerMessage = currentImage
    ? currentImage
    : hasBooks
    ? 'Choose a book to begin reading.'
    : 'No books found. Add files to /data to begin.';

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <aside className="sidebar">
        <h1 className="sidebar-title">Scanned Book Reader</h1>
        <ul className="book-list">
          {books.map((book) => (
            <li key={book}>
              <button
                type="button"
                className={`book-button ${bookId === book ? 'book-button-active' : ''}`}
                onClick={() => setBookId(book)}
              >
                {book}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="main">
        <Toolbar
          books={books}
          currentBook={bookId}
          manifestLength={manifest.length}
          currentPage={currentPage}
          onSelectBook={setBookId}
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
          audioStatus={audioState.status}
          onPlayAudio={() => void playAudio()}
          onStopAudio={stopAudio}
          gotoInputRef={gotoInputRef}
        />
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
