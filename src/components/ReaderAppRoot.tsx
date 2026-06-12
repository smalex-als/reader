import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useBookSession } from '@/hooks/useBookSession';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { ReaderCommandProvider } from '@/hooks/useReaderCommands';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { useReaderFeatureCommands } from '@/hooks/useReaderFeatureCommands';
import { useReaderShellControls } from '@/hooks/useReaderShellControls';

export default function ReaderAppRoot() {
  const {
    bookId,
    manifest,
    currentPage,
    viewMode
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

  const readerCommands = useReaderFeatureCommands({
    fitWidth,
    fitHeight,
    gotoInputRef,
    toggleFullscreen,
    playOcrBlock,
    setSelectedStreamBlockKey,
    stopStudyAudio,
    playStudyAudioSingle,
    playStudyAudioParagraph
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
