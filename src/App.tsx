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
import { useAudioController } from '@/hooks/useAudioController';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookmarks } from '@/hooks/useBookmarks';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { DEFAULT_STREAM_VOICE, useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useToast } from '@/hooks/useToast';
import { useTocManager } from '@/hooks/useTocManager';
import { useZoom } from '@/hooks/useZoom';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
import { saveLastPage } from '@/lib/storage';
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

function createDefaultSettings(): AppSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

function isStreamVoice(value: string): value is StreamVoice {
  return STREAM_VOICE_OPTIONS.includes(value as StreamVoice);
}

function getDefaultStreamVoice(): StreamVoice {
  return isStreamVoice(DEFAULT_STREAM_VOICE) ? DEFAULT_STREAM_VOICE : STREAM_VOICE_OPTIONS[0];
}

export default function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [ocrQueueOpen, setOcrQueueOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapterNumber, setEditorChapterNumber] = useState<number | null>(null);
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
  tocEntriesRef.current = setTocEntries;
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
  const { streamState, startStream, pauseStream, resumeStream, stopStream } = useStreamingAudio(showToast);
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
    handlePlayStream,
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

  useEffect(() => {
    closeBookmarks();
    resetTextState();
    resetAudioCache();
    stopAudio();
    stopStream();
  }, [bookId, closeBookmarks, resetAudioCache, resetTextState, stopAudio, stopStream]);

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

  useEffect(() => {
    resetQueue();
    setOcrQueueOpen(false);
  }, [bookId, resetQueue]);

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
    handlePlayStream,
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
          {(streamState.status === 'streaming' ||
            streamState.status === 'paused' ||
            streamState.status === 'connecting') && (
            <button
              type="button"
              className={`stream-bubble ${
                streamState.status === 'paused'
                  ? 'stream-bubble-paused'
                  : streamState.status === 'connecting'
                  ? 'stream-bubble-connecting'
                  : ''
              }`}
              onClick={() => void handleToggleStreamPause()}
              disabled={streamState.status === 'connecting'}
              aria-label={
                streamState.status === 'paused'
                  ? 'Resume stream audio'
                  : streamState.status === 'connecting'
                  ? 'Connecting stream audio'
                  : 'Pause stream audio'
              }
              title={
                streamState.status === 'paused'
                  ? 'Resume stream'
                  : streamState.status === 'connecting'
                  ? 'Connecting stream'
                  : 'Pause stream'
              }
            >
              {streamState.status === 'paused' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M8 5v14l11-7-11-7z" />
                </svg>
              ) : streamState.status === 'connecting' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 4a8 8 0 1 1-5.7 13.6l1.4-1.4A6 6 0 1 0 12 6v2l3-3-3-3v2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              )}
            </button>
          )}
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
            onAddEntry={() => handleAddTocEntry(currentPage)}
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
