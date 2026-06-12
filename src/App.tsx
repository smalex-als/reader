import {useCallback, useEffect, useMemo, useRef} from 'react';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import {useAudioController} from '@/hooks/useAudioController';
import {useBookSession} from '@/hooks/useBookSession';
import {useBookmarks} from '@/hooks/useBookmarks';
import {useChapterQuiz} from '@/hooks/useChapterQuiz';
import {useUnitTopicQuiz} from '@/hooks/useUnitTopicQuiz';
import {useUnitActions} from '@/hooks/useUnitActions';
import {useNavigation} from '@/hooks/useNavigation';
import {usePageText} from '@/hooks/usePageText';
import {useOcrQueue} from '@/hooks/useOcrQueue';
import {useStreamSequence} from '@/hooks/useStreamSequence';
import {useStreamingAudio} from '@/hooks/useStreamingAudio';
import {useStreamControls} from '@/hooks/useStreamControls';
import {useMp3Voice, useStreamVoices} from '@/hooks/useStreamVoices';
import {useUnitsRouteSync} from '@/hooks/useUnitsRoute';
import {useStreamHistoryLogger} from '@/hooks/useStreamHistoryLogger';
import {useOcrEditMode} from '@/hooks/useOcrEditMode';
import {useShareLink} from '@/hooks/useShareLink';
import {useDashboardNavigation} from '@/hooks/useDashboardNavigation';
import {useFloatingAudio} from '@/hooks/useFloatingAudio';
import {useFullscreen} from '@/hooks/useFullscreen';
import {useHotkeys} from '@/hooks/useHotkeys';
import {ReaderCommandProvider, type ReaderCommands} from '@/hooks/useReaderCommands';
import {useTocManager} from '@/hooks/useTocManager';
import {useWakeLock} from '@/hooks/useWakeLock';
import {useZoom} from '@/hooks/useZoom';
import {clampPan} from '@/lib/math';
import {makeStreamLocator} from '@/lib/streamLocator';
import {normalizeTextFontSize, normalizeTextTheme} from '@/lib/appConstants';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';

export default function App() {
  const dispatch = useAppDispatch();
  const pendingAlignTopRef = useRef(false);
  const lastImageRef = useRef<string | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const {
    settings,
    setSettings,
    metrics,
    applyZoomMode
  } = useZoom();

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  useStreamVoices();
  const {
    bookId,
    setBookId,
    manifest,
    bookType,
    chapterCount,
    currentPage,
    viewMode,
    loading
  } = useBookSession();

  useUnitsRouteSync();

  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentImage = manifest[currentPage] ?? null;
  const {
    sortedTocEntries,
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager();
  useMp3Voice();
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
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
  const {
    regenerateQuiz: handleRegenerateQuiz
  } = useChapterQuiz();
  const {
    regenerateQuiz: handleRegenerateUnitTopicQuiz
  } = useUnitTopicQuiz();

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
  } = useFloatingAudio();
  const isListening =
    audioState.status === 'playing' ||
    streamState.status === 'streaming' ||
    floatingAudioPlaybackState === 'playing';
  useWakeLock(isListening);
  const {
    currentText,
    fetchPageText,
    resetTextState,
    textLoading
  } = usePageText();
  useEffect(() => {
    dispatch(appActions.setDisplayedChapterText(null));
  }, [bookId, chapterNumber, dispatch]);
  useNavigation({
    pendingAlignTopRef
  });

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
    startStream,
    enqueueStream,
    stopStream,
    pauseStream,
    resumeStream,
    pauseStreamAtStart
  });
  const { setSelectedStreamBlockKey } = useStreamControls({
    startStreamSequence,
    handlePlayChapterParagraph,
    restartStreamFromPageKey,
    handleStopStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock
  });

  useStreamHistoryLogger();

  const {
    toggleOcrEditMode: handleToggleOcrEditMode,
    toggleSpeechBlock: handleToggleSpeechBlock
  } = useOcrEditMode();

  const handlePlayOcrBlock = useCallback(
    (payload: { imageUrl: string; startIndex: number; blockId: string }) => {
      setSelectedStreamBlockKey(makeStreamLocator(payload.imageUrl, payload.blockId));
      void handlePlayPageBlock(payload);
    },
    [handlePlayPageBlock, setSelectedStreamBlockKey]
  );

  const handleToggleOcrBlockSpeech = useCallback(
    (blockId: string) => {
      void handleToggleSpeechBlock(blockId);
    },
    [handleToggleSpeechBlock]
  );

  useEffect(() => {
    if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage || currentText) {
      return;
    }
    void fetchPageText({ silent: true });
  }, [currentImage, currentText, fetchPageText, viewMode]);
  const {
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  } = useOcrQueue();

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
  } = useDashboardNavigation();

  const handleToggleStudyMode = useCallback(() => {
    const enablingStudyMode = !settings.studyMode;
    setSettings((prev) => ({ ...prev, studyMode: !prev.studyMode }));
    if (
      enablingStudyMode &&
      (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused')
    ) {
      stopAfterCurrentStream();
    }
  }, [
    setSettings,
    settings.studyMode,
    stopAfterCurrentStream,
    streamState.status
  ]);

  useEffect(() => {
    resetQueue();
    dispatch(appActions.closeModal('ocrQueue'));
  }, [bookId, dispatch, resetQueue]);

  useShareLink();

  const {
    refreshUnits
  } = useUnitActions();

  const handlePlayStudyAudioQuizQuestion = useCallback(
    (payload: { text: string; questionIndex: number; contextKey: string }) => {
      void handlePlaySingleStream({
        text: payload.text,
        pageKey: `${payload.contextKey}::question-${payload.questionIndex + 1}`
      });
    },
    [handlePlaySingleStream]
  );

  const handlePlayStudyAudioQuizAnswer = useCallback(
    (payload: { text: string; questionIndex: number; contextKey: string }) => {
      void handlePlaySingleStream({
        text: payload.text,
        pageKey: `${payload.contextKey}::question-${payload.questionIndex + 1}::answer`
      });
    },
    [handlePlaySingleStream]
  );

  const handleRegenerateStudyAudioQuiz = useCallback(
    (modal: 'unitQuiz' | 'chapterQuiz') => {
      if (modal === 'unitQuiz') {
        void handleRegenerateUnitTopicQuiz().then(refreshUnits);
      } else {
        void handleRegenerateQuiz();
      }
    },
    [handleRegenerateQuiz, handleRegenerateUnitTopicQuiz, refreshUnits]
  );

  const handlePlayStudyAudioVocabulary = useCallback(
    (payload: { text: string; chapterNumber: number }) => {
      void handlePlaySingleStream({
        text: payload.text,
        pageKey: `vocabulary::chapter-${payload.chapterNumber}`
      });
    },
    [handlePlaySingleStream]
  );

  const handlePlayStudyAudioMemoryCard = useCallback(
    (payload: { text: string; chapterNumber: number }) => {
      void handlePlaySingleStream({
        text: payload.text,
        pageKey: `memory-card::chapter-${payload.chapterNumber}`
      });
    },
    [handlePlaySingleStream]
  );

  const handlePlayStudyAudioParagraph = useCallback(
    (payload: { fullText: string; startIndex: number; key: string }) => {
      void handlePlayChapterParagraph({
        fullText: payload.fullText,
        startIndex: payload.startIndex,
        key: payload.key
      });
    },
    [handlePlayChapterParagraph]
  );

  const applyZoomModeWithAlign = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      applyZoomMode(mode);
      if (viewMode === 'pages') {
        pendingAlignTopRef.current = true;
      }
    },
    [applyZoomMode, viewMode]
  );

  const handleFitWidth = useCallback(() => {
    applyZoomModeWithAlign('fit-width');
  }, [applyZoomModeWithAlign]);

  const handleFitHeight = useCallback(() => {
    applyZoomModeWithAlign('fit-height');
  }, [applyZoomModeWithAlign]);

  const handleToggleOcrEditModeCommand = useCallback(() => {
    void handleToggleOcrEditMode();
  }, [handleToggleOcrEditMode]);

  const handleToggleFullscreenCommand = useCallback(() => {
    void toggleFullscreen();
  }, [toggleFullscreen]);

  useHotkeys({
    gotoInputRef,
    fitWidth: handleFitWidth,
    fitHeight: handleFitHeight,
    toggleOcrEditMode: handleToggleOcrEditModeCommand,
    toggleFullscreen: handleToggleFullscreenCommand
  });

  const readerCommands = useMemo<ReaderCommands>(
    () => ({
      fitWidth: handleFitWidth,
      fitHeight: handleFitHeight,
      toggleOcrEditMode: handleToggleOcrEditModeCommand,
      toggleFullscreen: handleToggleFullscreenCommand,
      toggleStudyMode: handleToggleStudyMode,
      playOcrBlock: handlePlayOcrBlock,
      toggleOcrBlockSpeech: handleToggleOcrBlockSpeech,
      queueRemainingOcrPages: queueRemainingPages,
      queueAllOcrPages: queueAllPages,
      forceUpdateAllOcrPages: forceUpdateAllPages,
      retryFailedOcrPages: retryFailed,
      clearOcrQueue: clearQueue,
      toggleOcrQueuePause: togglePause,
      stopStudyAudio: handleStopStream,
      playStudyAudioQuizQuestion: handlePlayStudyAudioQuizQuestion,
      playStudyAudioQuizAnswer: handlePlayStudyAudioQuizAnswer,
      regenerateStudyAudioQuiz: handleRegenerateStudyAudioQuiz,
      playStudyAudioVocabulary: handlePlayStudyAudioVocabulary,
      playStudyAudioMemoryCard: handlePlayStudyAudioMemoryCard,
      playStudyAudioUnitTopicParagraph: handlePlayStudyAudioParagraph,
      playStudyAudioChapterParagraph: handlePlayStudyAudioParagraph,
      generateToc: (variant) => void handleGenerateToc(variant),
      saveToc: (variant) => void handleSaveToc(variant),
      addTocEntry: handleAddTocEntry,
      removeTocEntry: handleRemoveTocEntry,
      updateTocEntry: handleUpdateTocEntry,
      generateChapterText: (index) => void handleGenerateChapter(index)
    }),
    [
      clearQueue,
      forceUpdateAllPages,
      handleAddTocEntry,
      handleFitHeight,
      handleFitWidth,
      handleGenerateChapter,
      handleGenerateToc,
      handlePlayOcrBlock,
      handlePlayStudyAudioMemoryCard,
      handlePlayStudyAudioParagraph,
      handlePlayStudyAudioQuizAnswer,
      handlePlayStudyAudioQuizQuestion,
      handlePlayStudyAudioVocabulary,
      handleRegenerateStudyAudioQuiz,
      handleRemoveTocEntry,
      handleSaveToc,
      handleStopStream,
      handleToggleFullscreenCommand,
      handleToggleOcrBlockSpeech,
      handleToggleOcrEditModeCommand,
      handleToggleStudyMode,
      handleUpdateTocEntry,
      queueAllPages,
      queueRemainingPages,
      retryFailed,
      togglePause
    ]
  );

  const modalProps = {
    portalTarget: isFullscreen ? modalHostRef.current : null
  };

  const mainContentProps = {
    viewerShellRef,
    modalHostRef
  };

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderCommandProvider value={readerCommands}>
        <ReaderSidebar />
        <ReaderMainContent {...mainContentProps} />
        <ReaderModalLayer {...modalProps} />
      </ReaderCommandProvider>
    </div>
  );
}
