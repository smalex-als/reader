import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppModals from '@/components/AppModals';
import AppSidebar from '@/components/AppSidebar';
import ChapterEditor from '@/components/ChapterEditor';
import ChapterViewer from '@/components/ChapterViewer';
import StreamBubble from '@/components/StreamBubble';
import Viewer from '@/components/Viewer';
import { useAudioController } from '@/hooks/useAudioController';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useModalState } from '@/hooks/useModalState';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { DEFAULT_STREAM_VOICE, useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useToast } from '@/hooks/useToast';
import { useTocManager } from '@/hooks/useTocManager';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useZoom } from '@/hooks/useZoom';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
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

const TEXT_FONT_SIZE_OPTIONS = [18, 20, 24, 26, 28, 30, 34];
const TEXT_THEME_OPTIONS = [
  'dark',
  'dracula',
  'obsidian',
  'nord',
  'gruvbox',
  'solarized',
  'light',
  'warm'
] as const;
type TextTheme = (typeof TEXT_THEME_OPTIONS)[number];
const TEXT_FONT_SIZE_MIN = TEXT_FONT_SIZE_OPTIONS[0];
const TEXT_FONT_SIZE_MAX = TEXT_FONT_SIZE_OPTIONS[TEXT_FONT_SIZE_OPTIONS.length - 1];

const DEFAULT_SETTINGS: AppSettings = {
  zoom: 1,
  zoomMode: 'fit-width',
  rotation: 0,
  invert: false,
  brightness: 100,
  contrast: 100,
  pan: { x: 0, y: 0 },
  textFontSize: TEXT_FONT_SIZE_OPTIONS[0],
  textTheme: 'dark'
};

function normalizeTextFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.textFontSize;
  }
  let closest = TEXT_FONT_SIZE_OPTIONS[0];
  let smallestDelta = Math.abs(value - closest);
  for (const option of TEXT_FONT_SIZE_OPTIONS) {
    const delta = Math.abs(value - option);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = option;
    }
  }
  return closest;
}

function normalizeTextTheme(value: string): TextTheme {
  if (value === 'slate') {
    return 'dracula';
  }
  return TEXT_THEME_OPTIONS.includes(value as TextTheme) ? (value as TextTheme) : 'dark';
}

function createDefaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, pan: { ...DEFAULT_SETTINGS.pan } };
}

function isStreamVoice(value: string): value is StreamVoice {
  return STREAM_VOICE_OPTIONS.includes(value as StreamVoice);
}

function getDefaultStreamVoice(): StreamVoice {
  return isStreamVoice(DEFAULT_STREAM_VOICE) ? DEFAULT_STREAM_VOICE : STREAM_VOICE_OPTIONS[0];
}

export default function App() {
  const {
    helpOpen,
    openHelp,
    closeHelp,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber
  } = useModalState();
  const [chapterViewRefresh, setChapterViewRefresh] = useState(0);
  const [firstChapterParagraph, setFirstChapterParagraph] = useState<{
    fullText: string;
    startIndex: number;
    key: string;
  } | null>(null);
  const [streamVoice, setStreamVoice] = useState<StreamVoice>(() => getDefaultStreamVoice());
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

  const tocEntriesRef = useRef<React.Dispatch<React.SetStateAction<TocEntry[]>> | null>(null);
  const {
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
  } = useBookSession({
    settings,
    setSettings,
    setMetrics,
    showToast,
    setEditorOpen,
    setEditorChapterNumber,
    onUpdateTocEntries: (entries) => tocEntriesRef.current?.(entries),
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    createDefaultSettings
  });
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentImage = manifest[currentPage] ?? null;
  const {
    tocOpen,
    setTocOpen,
    tocManageOpen,
    setTocManageOpen,
    tocEntries,
    setTocEntries,
    sortedTocEntries,
    tocLoading,
    tocGenerating,
    tocSaving,
    chapterGeneratingIndex,
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager({
    bookId,
    manifestLength: isTextBook ? chapterCount : manifest.length,
    viewMode,
    showToast
  });
  useEffect(() => {
    tocEntriesRef.current = setTocEntries;
  }, [setTocEntries]);
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
  const hasBooks = books.length > 0;

  const {
    audioState,
    playAudio,
    resetAudio,
    resetAudioCache,
    stopAudio
  } = useAudioController(currentImage, showToast);
  const { streamState, startStream, pauseStream, resumeStream, stopStream } = useStreamingAudio(showToast);
  const isListening = audioState.status === 'playing' || streamState.status === 'streaming';
  useWakeLock(isFullscreen && isListening);
  const {
    closeTextModal,
    currentText,
    fetchPageText,
    regeneratedText,
    resetTextState,
    savePageText,
    setRegeneratedText,
    textLoading,
    textModalOpen,
    textSaving,
    toggleTextModal
  } = usePageText(currentImage, showToast);
  const {
    startStreamSequence,
    handlePlayChapterParagraph,
    handleStopStream,
    handleToggleStreamPause
  } = useStreamSequence({
    isTextBook,
    bookId,
    chapterCount,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    showToast,
    streamState,
    startStream,
    stopStream,
    pauseStream,
    resumeStream,
    stopAudio,
    streamVoice
  });
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
  const { renderPage, handlePrev, handleNext, footerMessage } = useNavigation({
    navigationCount,
    currentPage,
    viewMode,
    isTextBook,
    currentChapterIndex,
    sortedTocEntries,
    bookId,
    setCurrentPage,
    setRegeneratedText,
    pendingAlignTopRef,
    resetAudio,
    stopStream,
    currentImage,
    hasBooks,
    chapterNumber,
    currentChapterEntry
  });

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

  useEffect(() => {
    const normalized = normalizeTextFontSize(settings.textFontSize);
    if (normalized !== settings.textFontSize) {
      setSettings((prev) => {
        if (prev.textFontSize === normalized) {
          return prev;
        }
        return { ...prev, textFontSize: normalized };
      });
    }
  }, [settings.textFontSize, setSettings]);

  useEffect(() => {
    const normalized = normalizeTextTheme(settings.textTheme);
    if (normalized !== settings.textTheme) {
      setSettings((prev) => {
        if (prev.textTheme === normalized) {
          return prev;
        }
        return { ...prev, textTheme: normalized };
      });
    }
  }, [settings.textTheme, setSettings]);

  const handleViewModeChange = useCallback(
    (mode: 'pages' | 'text') => {
      if (isTextBook && mode === 'pages') {
        return;
      }
      setViewMode(mode);
    },
    [isTextBook, setViewMode]
  );

  const toggleViewMode = useCallback(() => {
    if (isTextBook) {
      return;
    }
    setViewMode((prev) => (prev === 'pages' ? 'text' : 'pages'));
  }, [isTextBook, setViewMode]);

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

  useEffect(() => {
    closeBookmarks();
    resetTextState();
    resetAudioCache();
    stopAudio();
    stopStream();
  }, [bookId, closeBookmarks, resetAudioCache, resetTextState, stopAudio, stopStream]);

  const applyFilters = useCallback(
    (filters: Partial<Pick<AppSettings, 'brightness' | 'contrast' | 'invert'>>) => {
      setSettings((prev) => ({
        ...prev,
        ...filters
      }));
    },
    [setSettings]
  );

  const updateTextFontSize = useCallback(
    (value: number) => {
      const clamped = clamp(value, TEXT_FONT_SIZE_MIN, TEXT_FONT_SIZE_MAX);
      const nextSize = normalizeTextFontSize(clamped);
      setSettings((prev) => {
        if (prev.textFontSize === nextSize) {
          return prev;
        }
        return { ...prev, textFontSize: nextSize };
      });
    },
    [setSettings]
  );

  const updateTextTheme = useCallback(
    (value: string) => {
      const nextTheme = normalizeTextTheme(value);
      setSettings((prev) => {
        if (prev.textTheme === nextTheme) {
          return prev;
        }
        return { ...prev, textTheme: nextTheme };
      });
    },
    [setSettings]
  );

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

  useEffect(() => {
    resetQueue();
    closeOcrQueue();
  }, [bookId, closeOcrQueue, resetQueue]);

  const handleCopyText = useCallback(async (overrideText?: string) => {
    if (!overrideText && !currentImage) {
      showToast('No page selected', 'error');
      return;
    }
    const pageText = overrideText ? null : currentText ?? (await fetchPageText());
    const textValue = (overrideText ?? pageText?.text ?? '').trim();
    if (!textValue) {
      showToast('No text available to copy', 'error');
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
      showToast('Copied page text to clipboard', 'success');
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
    [isStreamVoice, setStreamVoice]
  );

  const openBookModal = useCallback(() => setBookModalOpen(true), [setBookModalOpen]);
  const closeBookModal = useCallback(() => setBookModalOpen(false), [setBookModalOpen]);
  const applyZoomModeWithAlign = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      applyZoomMode(mode);
      if (viewMode === 'pages') {
        pendingAlignTopRef.current = true;
      }
    },
    [applyZoomMode, viewMode]
  );

  const { hotkeys } = useHotkeys({
    viewMode,
    currentImage,
    settings,
    updatePan,
    updateZoom,
    resetTransform,
    applyZoomModeWithAlign,
    updateRotation,
    applyFilters,
    toggleTextModal,
    toggleViewMode,
    handlePrev,
    handleNext,
    audioStatus: audioState.status,
    playAudio,
    stopAudio,
    stopStream,
    streamStatus: streamState.status,
    handleStopStream,
    handlePlayStream: startStreamSequence,
    gotoInputRef,
    toggleFullscreen,
    textModalOpen,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    bookModalOpen,
    ocrQueueOpen,
    tocOpen,
    tocManageOpen,
    closeTextModal,
    closeBookModal,
    closePrintModal,
    closeBookmarks,
    setOcrQueueOpen,
    setTocOpen,
    setTocManageOpen,
    openHelp,
    closeHelp,
    openBookModal
  });

  const toolbarProps = {
    currentBook: bookId,
    manifestLength: navigationCount,
    currentPage,
    viewMode,
    disablePagesMode: isTextBook,
    disableImageActions: isTextBook,
    onViewModeChange: handleViewModeChange,
    onOpenBookModal: openBookModal,
    onPrev: handlePrev,
    onNext: handleNext,
    onGoTo: (page: number) => renderPage(page),
    onZoomIn: () => updateZoom(settings.zoom + ZOOM_STEP),
    onZoomOut: () => updateZoom(settings.zoom - ZOOM_STEP),
    onResetZoom: resetTransform,
    onFitWidth: () => applyZoomModeWithAlign('fit-width'),
    onFitHeight: () => applyZoomModeWithAlign('fit-height'),
    onRotate: updateRotation,
    onInvert: () => applyFilters({ invert: !settings.invert }),
    invert: settings.invert,
    zoom: settings.zoom,
    rotation: settings.rotation,
    brightness: settings.brightness,
    contrast: settings.contrast,
    onBrightness: (value: number) => applyFilters({ brightness: value }),
    onContrast: (value: number) => applyFilters({ contrast: value }),
    onToggleTextModal: () => {
      toggleTextModal();
    },
    onCopyText: handleCopyText,
    onToggleFullscreen: () => void toggleFullscreen(),
    fullscreen: isFullscreen,
    audioState,
    onPlayAudio: () => {
      stopStream();
      void playAudio();
    },
    onStopAudio: stopAudio,
    streamState,
    streamVoice,
    streamVoiceOptions: STREAM_VOICE_OPTIONS,
    onStreamVoiceChange: handleStreamVoiceChange,
    onPlayStream: () => void startStreamSequence(),
    onStopStream: handleStopStream,
    onCreateChapter: () => {
      if (!isTextBook) {
        showToast('Select a text book to add chapters', 'error');
        return;
      }
      void handleCreateChapter({ bookName: '', chapterTitle: '' });
    },
    gotoInputRef,
    onToggleBookmark: toggleBookmark,
    onShowBookmarks: showBookmarks,
    isBookmarked,
    bookmarksCount: bookmarks.length,
    onOpenPrint: openPrintModal,
    onOpenHelp: openHelp,
    onOpenOcrQueue: openOcrQueue,
    onOpenToc: () => setTocOpen(true),
    onOpenTocManage: () => setTocManageOpen(true),
    ocrQueueTotal: ocrQueueState.total,
    ocrQueueProcessed: ocrQueueState.processed,
    ocrQueueFailed: ocrQueueState.failed,
    ocrQueueRunning: ocrQueueState.running,
    ocrQueuePaused: ocrQueueState.paused
  };

  const modalProps = {
    toastProps: { toast, onDismiss: dismiss },
    printModalProps: {
      open: printModalOpen,
      options: printOptions,
      selectedId: selectedPrintOption?.id ?? null,
      onSelect: setPrintSelection,
      onClose: closePrintModal,
      onConfirm: () => void createPrintPdf(),
      loading: printLoading
    },
    bookSelectModalProps: {
      open: bookModalOpen,
      books,
      currentBook: bookId,
      onSelect: (nextBook: string | null) => {
        setBookId(nextBook);
        closeBookModal();
      },
      onDelete: handleDeleteBook,
      onUploadChapter: handleUploadChapter,
      uploadingChapter,
      onUploadPdf: handleUploadPdf,
      uploadingPdf,
      onClose: closeBookModal
    },
    helpModalProps: { open: helpOpen, hotkeys, onClose: closeHelp },
    bookmarksModalProps: {
      open: bookmarksOpen,
      bookmarks,
      loading: bookmarksLoading,
      currentBook: bookId,
      currentPage,
      onClose: closeBookmarks,
      onSelect: handleSelectBookmark,
      onRemove: handleRemoveBookmarkFromList
    },
    textModalProps: {
      open: textModalOpen,
      text: currentText,
      loading: textLoading,
      onClose: closeTextModal,
      title: currentImage ?? 'Page text',
      onRegenerate: () => {
        setRegeneratedText(true);
        void fetchPageText(true);
      },
      regenerated: regeneratedText,
      saving: textSaving,
      onSave: (nextText: string) => {
        void savePageText(nextText);
      },
      onCopyText: (textValue: string) => {
        void handleCopyText(textValue);
      }
    },
    tocNavModalProps: {
      open: tocOpen,
      entries: tocEntries,
      loading: tocLoading,
      onClose: () => setTocOpen(false),
      onGoToPage: (pageIndex: number) => {
        setTocOpen(false);
        renderPage(pageIndex);
      }
    },
    tocModalProps: {
      open: tocManageOpen,
      entries: tocEntries,
      loading: tocLoading,
      generating: tocGenerating,
      saving: tocSaving,
      manifestLength: isTextBook ? chapterCount : manifest.length,
      chapterGeneratingIndex,
      allowGenerate: !isTextBook,
      onClose: () => setTocManageOpen(false),
      onGenerate: handleGenerateToc,
      onSave: handleSaveToc,
      onAddEntry: () => handleAddTocEntry(currentPage),
      onRemoveEntry: handleRemoveTocEntry,
      onUpdateEntry: handleUpdateTocEntry,
      onGenerateChapter: handleGenerateChapter
    },
    ocrQueueModalProps: {
      open: ocrQueueOpen,
      onClose: closeOcrQueue,
      jobs: ocrJobs,
      paused: ocrPaused,
      onTogglePause: togglePause,
      onQueueAll: queueAllPages,
      onQueueRemaining: queueRemainingPages,
      onQueueCurrent: queueCurrentPage,
      onRetryFailed: retryFailed,
      onClearQueue: clearQueue
    }
  };

  return (
      <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
        <AppSidebar toolbarProps={toolbarProps} />
        <main className="main">
          <div
            ref={viewerShellRef}
            className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''} ${
              viewMode === 'text' ? `viewer-shell-text theme-${settings.textTheme}` : ''
            }`}
          >
            {viewMode === 'pages' ? (
              <Viewer
                  imageUrl={currentImage}
                  settings={settings}
                  onPan={updatePan}
                  onZoom={updateZoom}
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
                  textFontSize={settings.textFontSize}
                  onTextFontSizeChange={updateTextFontSize}
                  textTheme={settings.textTheme}
                  onTextThemeChange={updateTextTheme}
                  refreshToken={chapterViewRefresh}
                  onFirstParagraphReady={setFirstChapterParagraph}
                  onPlayParagraph={handlePlayChapterParagraph}
              />
            )}
            {loading && <div className="viewer-status">Loading…</div>}
            <StreamBubble
              streamState={streamState}
              onTogglePause={() => void handleToggleStreamPause()}
              onStopStream={handleStopStream}
            />
          </div>
          <div className="page-footer">
            <span className="page-path">{footerMessage}</span>
          </div>
        </main>
        <AppModals {...modalProps} />
      </div>
  );
}
