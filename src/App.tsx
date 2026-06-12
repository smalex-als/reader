import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import {useBookSession} from '@/hooks/useBookSession';
import {useOcrQueue} from '@/hooks/useOcrQueue';
import {useUnitsRouteSync} from '@/hooks/useUnitsRoute';
import {useOcrEditMode} from '@/hooks/useOcrEditMode';
import {useShareLink} from '@/hooks/useShareLink';
import {useDashboardNavigation} from '@/hooks/useDashboardNavigation';
import {useHotkeys} from '@/hooks/useHotkeys';
import {useCurrentChapterContext} from '@/hooks/useCurrentChapterLabel';
import {ReaderCommandProvider} from '@/hooks/useReaderCommands';
import {useReaderAudioControls} from '@/hooks/useReaderAudioControls';
import {useReaderCommandBindings} from '@/hooks/useReaderCommandBindings';
import {useReaderShellControls} from '@/hooks/useReaderShellControls';
import {useTocManager} from '@/hooks/useTocManager';

export default function App() {
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
    fitHeight,
    gotoInputRef,
    isFullscreen,
    modalHostRef,
    toggleFullscreen,
    viewerShellRef
  } = useReaderShellControls({
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
  const {
    playOcrBlock,
    playStudyAudioParagraph,
    playStudyAudioSingle,
    setSelectedStreamBlockKey,
    stopStudyAudio
  } = useReaderAudioControls({
    bookId,
    chapterNumber
  });

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
    playOcrBlock,
    toggleOcrBlockSpeech: toggleSpeechBlock,
    setSelectedStreamBlockKey,
    queueRemainingOcrPages: queueRemainingPages,
    queueAllOcrPages: queueAllPages,
    forceUpdateAllOcrPages: forceUpdateAllPages,
    retryFailedOcrPages: retryFailed,
    clearOcrQueue: clearQueue,
    toggleOcrQueuePause: togglePause,
    stopStudyAudio,
    playStudyAudioSingle,
    playStudyAudioParagraph,
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
