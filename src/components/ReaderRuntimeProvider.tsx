import type { ReactNode } from 'react';
import { useBookSession } from '@/hooks/useBookSession';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useReaderAudioControls } from '@/hooks/useReaderAudioControls';
import { ReaderCommandProvider } from '@/hooks/useReaderCommands';
import { useReaderFeatureCommands } from '@/hooks/useReaderFeatureCommands';
import { useReaderShellControls } from '@/hooks/useReaderShellControls';
import { ReaderShellProvider } from '@/hooks/useReaderShellContext';

export default function ReaderRuntimeProvider({
  children
}: {
  children: ReactNode;
}) {
  const {
    bookId,
    manifest,
    currentPage,
    viewMode
  } = useBookSession();
  const { chapterNumber } = useCurrentChapterContext();
  const currentImage = manifest[currentPage] ?? null;
  const shellControls = useReaderShellControls({
    viewMode,
    currentImage
  });
  useReaderAudioControls({
    bookId,
    chapterNumber
  });
  const readerCommands = useReaderFeatureCommands({
    fitWidth: shellControls.fitWidth,
    fitHeight: shellControls.fitHeight,
    gotoInputRef: shellControls.gotoInputRef,
    toggleFullscreen: shellControls.toggleFullscreen
  });

  return (
    <ReaderShellProvider value={shellControls}>
      <ReaderCommandProvider value={readerCommands}>
        {children}
      </ReaderCommandProvider>
    </ReaderShellProvider>
  );
}
