import {useCallback, useEffect, useMemo, useRef} from 'react';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import {useAudioController} from '@/hooks/useAudioController';
import {useBookSession} from '@/hooks/useBookSession';
import {useBookmarks} from '@/hooks/useBookmarks';
import {useNavigation} from '@/hooks/useNavigation';
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
import {useCurrentChapterContext} from '@/hooks/useCurrentChapterLabel';
import {ReaderCommandProvider, type ReaderCommands} from '@/hooks/useReaderCommands';
import {useTocManager} from '@/hooks/useTocManager';
import {usePlaybackWakeLock} from '@/hooks/useWakeLock';
import {useZoom} from '@/hooks/useZoom';
import {makeStreamLocator} from '@/lib/streamLocator';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';

export default function App() {
  const dispatch = useAppDispatch();
  const pendingAlignTopRef = useRef(false);
  const modalHostRef = useRef<HTMLDivElement | null>(null);

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  useStreamVoices();
  const {
    bookId,
    setBookId,
    manifest,
    currentPage,
    viewMode,
    loading
  } = useBookSession();
  const { chapterNumber } = useCurrentChapterContext();
  const currentImage = manifest[currentPage] ?? null;
  const {
    settings,
    setSettings,
    fitWidth,
    fitHeight
  } = useZoom({
    pendingAlignTopRef,
    viewMode,
    currentImage
  });

  useUnitsRouteSync();

  const {
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager();
  useMp3Voice();
  const {
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

  useFloatingAudio();
  usePlaybackWakeLock();
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

  const {
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    retryFailed,
    togglePause
  } = useOcrQueue();

  const { closeBookmarks } = useBookmarks();

  useEffect(() => {
    closeBookmarks();
    dispatch(appActions.closeModal('search'));
    dispatch(appActions.closeModal('text'));
    dispatch(appActions.closeBookCard());
    dispatch(appActions.resetPageText());
    resetAudioCache();
    stopAudio();
    stopStream();
  }, [bookId, closeBookmarks, dispatch, resetAudioCache, stopAudio, stopStream]);

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

  useShareLink();

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

  const handleToggleOcrEditModeCommand = useCallback(() => {
    void handleToggleOcrEditMode();
  }, [handleToggleOcrEditMode]);

  const handleToggleFullscreenCommand = useCallback(() => {
    void toggleFullscreen();
  }, [toggleFullscreen]);

  useHotkeys({
    gotoInputRef,
    fitWidth,
    fitHeight,
    toggleOcrEditMode: handleToggleOcrEditModeCommand,
    toggleFullscreen: handleToggleFullscreenCommand
  });

  const readerCommands = useMemo<ReaderCommands>(
    () => ({
      fitWidth,
      fitHeight,
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
      playStudyAudioSingle: (payload) => void handlePlaySingleStream(payload),
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
      fitHeight,
      fitWidth,
      forceUpdateAllPages,
      handleAddTocEntry,
      handleGenerateChapter,
      handleGenerateToc,
      handlePlayOcrBlock,
      handlePlayStudyAudioParagraph,
      handlePlaySingleStream,
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
