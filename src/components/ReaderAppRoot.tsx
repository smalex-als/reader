import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useBookSession } from '@/hooks/useBookSession';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { ReaderCommandProvider } from '@/hooks/useReaderCommands';
import { useReaderFeatureCommands } from '@/hooks/useReaderFeatureCommands';
import { useReaderShellControls } from '@/hooks/useReaderShellControls';
import { ReaderShellProvider, useReaderShell } from '@/hooks/useReaderShellContext';

export default function ReaderAppRoot() {
  const {
    bookId,
    manifest,
    currentPage,
    viewMode
  } = useBookSession();
  const { chapterNumber } = useCurrentChapterContext();
  const shellControls = useReaderShellControls({
    viewMode,
    currentImage: manifest[currentPage] ?? null
  });
  const readerCommands = useReaderFeatureCommands({
    gotoInputRef: shellControls.gotoInputRef
  });
  useReaderAudioControls({
    bookId,
    chapterNumber
  });

  return (
    <ReaderShellProvider value={shellControls}>
      <ReaderCommandProvider value={readerCommands}>
        <ReaderAppLayout />
      </ReaderCommandProvider>
    </ReaderShellProvider>
  );
}

function ReaderAppLayout() {
  const { isFullscreen } = useReaderShell();
  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar />
      <ReaderMainContent />
      <ReaderModalLayer />
    </div>
  );
}
