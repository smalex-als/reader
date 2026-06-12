import {useRef} from 'react';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import {useAudioController} from '@/hooks/useAudioController';
import {useBookSession} from '@/hooks/useBookSession';
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
import {ReaderCommandProvider} from '@/hooks/useReaderCommands';
import {useReaderCommandBindings} from '@/hooks/useReaderCommandBindings';
import {useReaderLifecycleEffects} from '@/hooks/useReaderLifecycleEffects';
import {useTocManager} from '@/hooks/useTocManager';
import {usePlaybackWakeLock} from '@/hooks/useWakeLock';
import {useZoom} from '@/hooks/useZoom';

export default function App() {
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
  useReaderLifecycleEffects({
    bookId,
    chapterNumber,
    resetAudioCache,
    stopAudio,
    stopStream
  });
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
    handleStopAfterCurrentStream: stopAfterCurrentStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock
  });

  useStreamHistoryLogger();

  const {
    toggleOcrEditMode,
    toggleSpeechBlock
  } = useOcrEditMode();

  const {
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    retryFailed,
    togglePause
  } = useOcrQueue();

  useDashboardNavigation();

  useShareLink();

  const readerCommands = useReaderCommandBindings({
    fitWidth,
    fitHeight,
    toggleOcrEditMode,
    toggleFullscreen,
    playOcrBlock: handlePlayPageBlock,
    toggleOcrBlockSpeech: toggleSpeechBlock,
    setSelectedStreamBlockKey,
    queueRemainingOcrPages: queueRemainingPages,
    queueAllOcrPages: queueAllPages,
    forceUpdateAllOcrPages: forceUpdateAllPages,
    retryFailedOcrPages: retryFailed,
    clearOcrQueue: clearQueue,
    toggleOcrQueuePause: togglePause,
    stopStudyAudio: handleStopStream,
    playStudyAudioSingle: handlePlaySingleStream,
    playStudyAudioParagraph: handlePlayChapterParagraph,
    generateToc: handleGenerateToc,
    saveToc: handleSaveToc,
    addTocEntry: handleAddTocEntry,
    removeTocEntry: handleRemoveTocEntry,
    updateTocEntry: handleUpdateTocEntry,
    generateChapterText: handleGenerateChapter
  });

  useHotkeys({
    gotoInputRef,
    fitWidth,
    fitHeight,
    toggleOcrEditMode: readerCommands.toggleOcrEditMode,
    toggleFullscreen: readerCommands.toggleFullscreen
  });

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
