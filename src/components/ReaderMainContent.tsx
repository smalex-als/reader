import ChapterEditor from '@/components/ChapterEditor';
import AudioLibraryView from '@/components/AudioLibraryView';
import AudioView from '@/components/AudioView';
import FloatingAudioPlayer from '@/components/FloatingAudioPlayer';
import ChapterViewer from '@/components/ChapterViewer';
import StreamBubble from '@/components/StreamBubble';
import ScrollViewer from '@/components/ScrollViewer';
import UnitsView from '@/components/UnitsView';
import Viewer from '@/components/Viewer';
import type { ReaderShellControls } from '@/hooks/useReaderShellControls';
import {
  selectBookSessionWorkflow,
  selectEditorState,
  selectNavigationState,
  selectReaderSession,
  selectViewerWorkflow,
  useAppSelector
} from '@/state/appState';

type ReaderMainContentProps = {
  shellControls: Pick<ReaderShellControls, 'viewerShellRef' | 'modalHostRef'>;
};

export default function ReaderMainContent({
  shellControls
}: ReaderMainContentProps) {
  const { viewerShellRef, modalHostRef } = shellControls;
  const { mainView } = useAppSelector(selectNavigationState);
  const { currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { books, loading, manifest } = useAppSelector(selectBookSessionWorkflow);
  const { open: editorOpen } = useAppSelector(selectEditorState);
  const {
    settings: { textTheme }
  } = useAppSelector(selectViewerWorkflow);
  const currentImage = manifest[currentPage] ?? null;
  const footerMessage =
    viewMode === 'audio' || viewMode === 'text'
      ? ''
      : currentImage
      ? currentImage
      : books.length > 0
      ? 'Choose a book to begin reading.'
      : 'No books found. Add files to /data to begin.';
  const displayFooterMessage =
    mainView === 'audio-library' ? 'MP3 Library' : mainView === 'units' ? 'Units' : footerMessage;

  return (
    <main className="main">
      <div
        ref={viewerShellRef}
        className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''} ${
          mainView === 'audio-library' || mainView === 'units' || viewMode === 'text' || viewMode === 'audio'
            ? `viewer-shell-text theme-${textTheme}`
            : ''
        }`}
      >
        {mainView === 'audio-library' ? (
          <AudioLibraryView />
        ) : mainView === 'units' ? (
          <UnitsView />
        ) : viewMode === 'pages' ? (
          <Viewer />
        ) : viewMode === 'scroll' ? (
          <ScrollViewer />
        ) : viewMode === 'text' ? (
          editorOpen ? (
            <ChapterEditor />
          ) : (
            <ChapterViewer />
          )
        ) : (
          <AudioView />
        )}
        {loading && <div className="viewer-status">Loading...</div>}
        <StreamBubble />
        <FloatingAudioPlayer />
        <div ref={modalHostRef} className="modal-portal" />
      </div>
      <div className="page-footer">
        <span className="page-path">{displayFooterMessage}</span>
      </div>
    </main>
  );
}
