import { useCallback, useEffect, useMemo, useRef } from 'react';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useAudioController } from '@/hooks/useAudioController';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useChapterTextContext } from '@/hooks/useChapterTextContext';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import { useUnitActions } from '@/hooks/useUnitActions';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useStreamControls } from '@/hooks/useStreamControls';
import { useMp3Voice, useStreamVoices } from '@/hooks/useStreamVoices';
import { useUnitsRouteState, useUnitsRouteSync } from '@/hooks/useUnitsRoute';
import { useStreamHistoryLogger } from '@/hooks/useStreamHistoryLogger';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useShareLink } from '@/hooks/useShareLink';
import { useCopyActions } from '@/hooks/useCopyActions';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useFloatingAudio } from '@/hooks/useFloatingAudio';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useToast } from '@/hooks/useToast';
import { useTocManager } from '@/hooks/useTocManager';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useZoom } from '@/hooks/useZoom';
import { clampPan } from '@/lib/math';
import { trackEvent } from '@/lib/analytics';
import { makeStreamLocator } from '@/lib/streamLocator';
import {
  createDefaultSettings,
  getMainViewFromLocation,
  normalizeTextFontSize,
  normalizeTextTheme,
  type MainView
} from '@/lib/appConstants';
import type {
  AppSettings,
  TocEntry
} from '@/types/app';
import {
  appActions,
  selectChapterCommandRequest,
  selectOcrBlockCommandRequest,
  selectOcrQueueCommandRequest,
  selectStudyAudioCommandRequest,
  selectStudyModeToggleRequest,
  selectToolbarCommandRequest,
  selectTocCommandRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function App() {
  const dispatch = useAppDispatch();
  const chapterCommandRequest = useAppSelector(selectChapterCommandRequest);
  const ocrBlockCommandRequest = useAppSelector(selectOcrBlockCommandRequest);
  const ocrQueueCommandRequest = useAppSelector(selectOcrQueueCommandRequest);
  const studyAudioCommandRequest = useAppSelector(selectStudyAudioCommandRequest);
  const studyModeToggleRequest = useAppSelector(selectStudyModeToggleRequest);
  const toolbarCommandRequest = useAppSelector(selectToolbarCommandRequest);
  const tocCommandRequest = useAppSelector(selectTocCommandRequest);
  const {
    mainView,
    selectedUnitSetId,
    selectedUnitTopicId
  } = useUnitsRouteState();
  const {
    displayedChapterText,
    firstChapterParagraph
  } = useChapterTextContext();
  const pendingAlignTopRef = useRef(false);
  const lastImageRef = useRef<string | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const {
    settings,
    setSettings,
    metrics,
    applyZoomMode,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform
  } = useZoom(createDefaultSettings());

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { showToast } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const tocEntriesRef = useRef<React.Dispatch<React.SetStateAction<TocEntry[]>> | null>(null);
  const {
    streamVoiceOptions,
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    mp3VoiceOptions,
    getDefaultMp3Voice
  } = useStreamVoices();
  const {
    books,
    bookId,
    setBookId,
    manifest,
    bookType,
    chapterCount,
    currentPage,
    viewMode,
    setViewMode,
    loading,
    handleCreateChapter,
    handleDeleteChapter
  } = useBookSession({
    urlSyncPaused: mainView === 'units',
    onUpdateTocEntries: (entries) => tocEntriesRef.current?.(entries),
    isStreamVoice,
    getDefaultStreamVoice,
    createDefaultSettings
  });

  useUnitsRouteSync();

  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentImage = manifest[currentPage] ?? null;
  const {
    tocOpen,
    tocEntries,
    setTocEntries,
    sortedTocEntries,
    sortedDetailedTocEntries,
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager();
  useEffect(() => {
    tocEntriesRef.current = setTocEntries;
  }, [setTocEntries]);
  const { setMp3Voice } = useMp3Voice({ bookId, mp3VoiceOptions, getDefaultMp3Voice });
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
  const nextChapterEntry =
    !isTextBook && currentChapterIndex !== null
      ? sortedTocEntries[currentChapterIndex + 1]
      : null;
  const currentSubchapterEntry = useMemo(() => {
    if (sortedDetailedTocEntries.length === 0) {
      return null;
    }
    const chapterStart = currentChapterEntry?.page ?? 0;
    const chapterEnd = nextChapterEntry?.page ?? manifest.length;
    const candidates = sortedDetailedTocEntries.filter((entry) => {
      if (!Number.isInteger(entry.page)) {
        return false;
      }
      return entry.page >= chapterStart && entry.page <= currentPage && entry.page < chapterEnd;
    });
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }, [currentChapterEntry?.page, currentPage, manifest.length, nextChapterEntry?.page, sortedDetailedTocEntries]);
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
  const {
    openQuiz: handleOpenQuiz,
    regenerateQuiz: handleRegenerateQuiz
  } = useChapterQuiz();
  const {
    openQuiz: handleOpenUnitTopicQuiz,
    regenerateQuiz: handleRegenerateUnitTopicQuiz
  } = useUnitTopicQuiz({
    unitSetId: selectedUnitSetId,
    topicId: selectedUnitTopicId
  });
  const {
    openVocabulary: handleOpenVocabulary
  } = useChapterVocabulary();
  const {
    openMemoryCard: handleOpenMemoryCard
  } = useChapterMemoryCard();
  const hasBooks = books.length > 0;

  const {
    audioState,
    resetAudio,
    resetAudioCache,
    stopAudio
  } = useAudioController();
  const {
    streamState,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream,
    stopAfterCurrentStream,
    pauseStreamAtStart
  } = useStreamingAudio();

  useEffect(() => {
    dispatch(appActions.setStreamRuntime(streamState));
  }, [dispatch, streamState]);

  const {
    floatingAudioPlaybackState,
    playFloatingAudio: handlePlayFloatingAudio
  } = useFloatingAudio({ audioState });
  const isListening =
    audioState.status === 'playing' ||
    streamState.status === 'streaming' ||
    floatingAudioPlaybackState === 'playing';
  useWakeLock(isListening);
  const {
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    resetTextState,
    savePageText,
    textLoading,
    toggleTextModal,
    updatePageTextBlocks
  } = usePageText(currentImage);
  useEffect(() => {
    dispatch(appActions.setDisplayedChapterText(null));
  }, [bookId, chapterNumber, dispatch]);
  const { renderPage, handlePrev, handleNext, footerMessage } = useNavigation({
    navigationCount,
    currentPage,
    viewMode,
    isTextBook,
    currentChapterIndex,
    sortedTocEntries,
    bookId,
    pendingAlignTopRef,
    resetAudio,
    stopStream,
    currentImage,
    hasBooks,
    chapterNumber,
    currentChapterEntry
  });

  const handleStreamSequenceComplete = useCallback(
    (source: 'page' | 'chapter') => {
      if (source !== 'page' || viewMode !== 'pages') {
        handleNext();
        return;
      }
      const nextImage = manifest[currentPage + 1] ?? null;
      if (!nextImage) {
        handleNext();
        return;
      }
      void fetchPageTextByImage(nextImage, { silent: true, updateCurrentState: false }).finally(() => {
        handleNext();
      });
    },
    [currentPage, fetchPageTextByImage, handleNext, manifest, viewMode]
  );
  const {
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleStopStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
    restartStreamFromPageKey
  } = useStreamSequence({
    viewMode,
    isTextBook,
    bookId,
    chapterCount,
    currentPage,
    manifest,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    streamState,
    startStream,
    enqueueStream,
    stopStream,
    pauseStream,
    resumeStream,
    pauseStreamAtStart,
    stopAudio,
    streamVoice,
    studyMode: settings.studyMode,
    onSequenceComplete: handleStreamSequenceComplete
  });
  const {
    setSelectedStreamBlockKey,
    handlePlayVisibleStream
  } = useStreamControls({
    bookId,
    chapterNumber,
    viewMode,
    displayedChapterText,
    streamState,
    startStreamSequence,
    handlePlayChapterParagraph,
    restartStreamFromPageKey,
    handleStopStream,
    handleToggleStreamPause,
    isStreamVoice,
    setStreamVoice,
    mp3VoiceOptions,
    setMp3Voice
  });

  useStreamHistoryLogger({
    bookId,
    chapterNumber,
    currentChapterEntry,
    currentSubchapterEntry,
    currentPage,
    streamState
  });

  const {
    toggleOcrEditMode: handleToggleOcrEditMode,
    toggleSpeechBlock: handleToggleSpeechBlock
  } = useOcrEditMode({
    currentImage,
    currentText,
    isTextBook,
    fetchPageText,
    savePageText,
    updatePageTextBlocks
  });

  useEffect(() => {
    if (!ocrBlockCommandRequest) {
      return;
    }

    if (ocrBlockCommandRequest.kind === 'playBlock') {
      const payload = {
        imageUrl: ocrBlockCommandRequest.imageUrl,
        startIndex: ocrBlockCommandRequest.startIndex,
        blockId: ocrBlockCommandRequest.blockId
      };
      setSelectedStreamBlockKey(makeStreamLocator(payload.imageUrl, payload.blockId));
      void handlePlayPageBlock(payload);
    } else {
      void handleToggleSpeechBlock(ocrBlockCommandRequest.blockId);
    }

    dispatch(appActions.clearOcrBlockCommandRequest());
  }, [
    dispatch,
    handlePlayPageBlock,
    handleToggleSpeechBlock,
    ocrBlockCommandRequest,
    setSelectedStreamBlockKey
  ]);

  useEffect(() => {
    if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage || currentText) {
      return;
    }
    void fetchPageText({ silent: true });
  }, [currentImage, currentText, fetchPageText, viewMode]);
  const {
    jobs: ocrJobs,
    paused: ocrPaused,
    queueState: ocrQueueState,
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  } = useOcrQueue();

  useEffect(() => {
    dispatch(appActions.setOcrQueueSnapshot({
      jobs: ocrJobs,
      paused: ocrPaused,
      queueState: ocrQueueState
    }));
  }, [dispatch, ocrJobs, ocrPaused, ocrQueueState]);

  useEffect(() => {
    if (!ocrQueueCommandRequest) {
      return;
    }

    if (ocrQueueCommandRequest.kind === 'togglePause') {
      togglePause();
    } else if (ocrQueueCommandRequest.kind === 'queueAll') {
      queueAllPages();
    } else if (ocrQueueCommandRequest.kind === 'forceUpdateAll') {
      forceUpdateAllPages();
    } else if (ocrQueueCommandRequest.kind === 'queueRemaining') {
      queueRemainingPages();
    } else if (ocrQueueCommandRequest.kind === 'retryFailed') {
      retryFailed();
    } else {
      clearQueue();
    }

    dispatch(appActions.clearOcrQueueCommandRequest());
  }, [
    clearQueue,
    dispatch,
    forceUpdateAllPages,
    ocrQueueCommandRequest,
    queueAllPages,
    queueRemainingPages,
    retryFailed,
    togglePause
  ]);

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
    (mode: 'pages' | 'scroll' | 'text' | 'audio') => {
      if (isTextBook && (mode === 'pages' || mode === 'scroll')) {
        return;
      }
      dispatch(appActions.setMainView('reader'));
      setViewMode(mode);
    },
    [dispatch, isTextBook, setViewMode]
  );

  const { closeBookmarks } = useBookmarks();

  useEffect(() => {
    closeBookmarks();
    dispatch(appActions.closeModal('search'));
    dispatch(appActions.closeBookCard());
    resetTextState();
    resetAudioCache();
    stopAudio();
    stopStream();
  }, [bookId, closeBookmarks, dispatch, resetAudioCache, resetTextState, stopAudio, stopStream]);

  const {
    handleOpenAudioLibrary
  } = useDashboardNavigation({
    bookId,
    setBookId,
    renderPage
  });

  const applyFilters = useCallback(
    (
      filters: Partial<
        Pick<AppSettings, 'brightness' | 'contrast' | 'invert' | 'dimOutsideBlocks' | 'dimOutsideBlocksIntensity'>
      >
    ) => {
      setSettings((prev) => ({
        ...prev,
        ...filters
      }));
    },
    [setSettings]
  );

  useEffect(() => {
    if (!studyModeToggleRequest) {
      return;
    }

    const enablingStudyMode = !settings.studyMode;
    setSettings((prev) => ({ ...prev, studyMode: !prev.studyMode }));
    if (
      enablingStudyMode &&
      (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused')
    ) {
      stopAfterCurrentStream();
    }
    dispatch(appActions.clearStudyModeToggleRequest());
  }, [
    dispatch,
    setSettings,
    settings.studyMode,
    stopAfterCurrentStream,
    streamState.status,
    studyModeToggleRequest
  ]);

  useEffect(() => {
    resetQueue();
    dispatch(appActions.closeModal('ocrQueue'));
  }, [bookId, dispatch, resetQueue]);

  const { handleCopyText } = useCopyActions({
    currentImage,
    currentText,
    fetchPageText
  });

  useShareLink();

  const {
    refreshUnits
  } = useUnitActions({
    bookId,
    chapterNumber,
    currentChapterTitle: currentChapterEntry?.title ?? null
  });

  useEffect(() => {
    if (!studyAudioCommandRequest) {
      return;
    }

    if (studyAudioCommandRequest.kind === 'stop') {
      handleStopStream();
    } else if (studyAudioCommandRequest.kind === 'quizQuestion') {
      void handlePlaySingleStream({
        text: studyAudioCommandRequest.text,
        pageKey: `${studyAudioCommandRequest.contextKey}::question-${studyAudioCommandRequest.questionIndex + 1}`
      });
    } else if (studyAudioCommandRequest.kind === 'quizAnswer') {
      void handlePlaySingleStream({
        text: studyAudioCommandRequest.text,
        pageKey: `${studyAudioCommandRequest.contextKey}::question-${studyAudioCommandRequest.questionIndex + 1}::answer`
      });
    } else if (studyAudioCommandRequest.kind === 'quizRegenerate') {
      if (studyAudioCommandRequest.modal === 'unitQuiz') {
        void handleRegenerateUnitTopicQuiz().then(refreshUnits);
      } else {
        void handleRegenerateQuiz();
      }
    } else if (studyAudioCommandRequest.kind === 'vocabulary') {
      void handlePlaySingleStream({
        text: studyAudioCommandRequest.text,
        pageKey: `vocabulary::chapter-${studyAudioCommandRequest.chapterNumber}`
      });
    } else if (studyAudioCommandRequest.kind === 'memoryCard') {
      void handlePlaySingleStream({
        text: studyAudioCommandRequest.text,
        pageKey: `memory-card::chapter-${studyAudioCommandRequest.chapterNumber}`
      });
    } else if (studyAudioCommandRequest.kind === 'unitTopicParagraph') {
      void handlePlayChapterParagraph({
        fullText: studyAudioCommandRequest.fullText,
        startIndex: studyAudioCommandRequest.startIndex,
        key: studyAudioCommandRequest.key
      });
    } else {
      void handlePlayChapterParagraph({
        fullText: studyAudioCommandRequest.fullText,
        startIndex: studyAudioCommandRequest.startIndex,
        key: studyAudioCommandRequest.key
      });
    }

    dispatch(appActions.clearStudyAudioCommandRequest());
  }, [
    dispatch,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleRegenerateQuiz,
    handleRegenerateUnitTopicQuiz,
    handleStopStream,
    refreshUnits,
    studyAudioCommandRequest
  ]);

  useEffect(() => {
    if (!chapterCommandRequest) {
      return;
    }

    if (!isTextBook) {
      showToast('Select a text book to manage chapters', 'error');
      dispatch(appActions.clearChapterCommandRequest());
      return;
    }

    if (chapterCommandRequest.kind === 'create') {
      void handleCreateChapter({ bookName: '', chapterTitle: '' });
    } else {
      void handleDeleteChapter(chapterCommandRequest.chapterNumber);
    }

    dispatch(appActions.clearChapterCommandRequest());
  }, [
    chapterCommandRequest,
    dispatch,
    handleCreateChapter,
    handleDeleteChapter,
    isTextBook,
    showToast
  ]);

  useEffect(() => {
    if (!tocCommandRequest) {
      return;
    }

    if (tocCommandRequest.kind === 'generate') {
      void handleGenerateToc(tocCommandRequest.variant);
    } else if (tocCommandRequest.kind === 'save') {
      void handleSaveToc(tocCommandRequest.variant);
    } else if (tocCommandRequest.kind === 'addEntry') {
      handleAddTocEntry(tocCommandRequest.pageIndex, tocCommandRequest.variant);
    } else if (tocCommandRequest.kind === 'removeEntry') {
      handleRemoveTocEntry(tocCommandRequest.index, tocCommandRequest.variant);
    } else if (tocCommandRequest.kind === 'updateEntry') {
      handleUpdateTocEntry(tocCommandRequest.index, tocCommandRequest.entry, tocCommandRequest.variant);
    } else {
      void handleGenerateChapter(tocCommandRequest.index);
    }

    dispatch(appActions.clearTocCommandRequest());
  }, [
    dispatch,
    handleAddTocEntry,
    handleGenerateChapter,
    handleGenerateToc,
    handleRemoveTocEntry,
    handleSaveToc,
    handleUpdateTocEntry,
    tocCommandRequest
  ]);

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
    if (!toolbarCommandRequest) {
      return;
    }

    if (toolbarCommandRequest.kind === 'fitWidth') {
      applyZoomModeWithAlign('fit-width');
    } else if (toolbarCommandRequest.kind === 'fitHeight') {
      applyZoomModeWithAlign('fit-height');
    } else if (toolbarCommandRequest.kind === 'toggleOcrEditMode') {
      void handleToggleOcrEditMode();
    } else if (toolbarCommandRequest.kind === 'toggleFullscreen') {
      void toggleFullscreen();
    } else if (toolbarCommandRequest.kind === 'createChapter') {
      if (!isTextBook) {
        showToast('Select a text book to add chapters', 'error');
      } else {
        void handleCreateChapter({ bookName: '', chapterTitle: '' });
      }
    }

    dispatch(appActions.clearToolbarCommandRequest());
  }, [
    applyZoomModeWithAlign,
    dispatch,
    handleCreateChapter,
    handleToggleOcrEditMode,
    isTextBook,
    showToast,
    toggleFullscreen,
    toolbarCommandRequest
  ]);

  useHotkeys({
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
    triggerBackgroundOcr: async () => {
      if (!currentImage || isTextBook) {
        return;
      }
      showToast('Starting OCR…', 'info');
      const pageText = await fetchPageText({ force: true, silent: true, engine: 'deepseek_ocr' });
      if (pageText) {
        showToast('OCR finished', 'success');
      }
    },
    toggleOcrEditMode: handleToggleOcrEditMode,
    handlePrev,
    handleNext,
    streamStatus: streamState.status,
    handleStopStream,
    handlePlayStream: handlePlayVisibleStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
    gotoInputRef,
    toggleFullscreen,
    onOpenQuiz: () => {
      dispatch(appActions.closeModal('settings'));
      if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
        void handleOpenUnitTopicQuiz();
        return;
      }
      void handleOpenQuiz();
    },
    onOpenVocabulary: () => {
      dispatch(appActions.closeModal('settings'));
      void handleOpenVocabulary();
    },
    onOpenMemoryCard: () => {
      dispatch(appActions.closeModal('settings'));
      void handleOpenMemoryCard();
    }
  });

  const modalProps = {
    portalTarget: isFullscreen ? modalHostRef.current : null
  };

  const mainContentProps = {
    viewerShellRef,
    modalHostRef,
    footerMessage,
    scrollViewerProps: {
      fetchPageTextByImage
    }
  };

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar />
      <ReaderMainContent {...mainContentProps} />
      <ReaderModalLayer {...modalProps} />
    </div>
  );
}
