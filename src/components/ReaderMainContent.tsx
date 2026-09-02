import type { CSSProperties } from 'react';
import ChapterEditor from '@/components/ChapterEditor';
import AudioLibraryView from '@/components/AudioLibraryView';
import AudioView from '@/components/AudioView';
import FloatingAudioPlayer from '@/components/FloatingAudioPlayer';
import ChapterViewer from '@/components/ChapterViewer';
import ReaderContextToolbar from '@/components/ReaderContextToolbar';
import ReaderStateCard from '@/components/ReaderStateCard';
import StreamBubble from '@/components/StreamBubble';
import ScrollViewer from '@/components/ScrollViewer';
import UnitsView from '@/components/UnitsView';
import Viewer from '@/components/Viewer';
import type { ReaderShellControls } from '@/hooks/useReaderShellControls';
import {
  getTextBrightnessPercentage,
  getTextFontFamilyCssValue
} from '@/lib/appConstants';
import {
  selectBookManifest,
  selectBookSessionLoading,
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
  const loading = useAppSelector(selectBookSessionLoading);
  const manifest = useAppSelector(selectBookManifest);
  const { open: editorOpen } = useAppSelector(selectEditorState);
  const {
    settings: { textBrightness, textFontFamily, textTheme }
  } = useAppSelector(selectViewerWorkflow);
  const viewerShellStyle = {
    '--text-viewer-font-family': getTextFontFamilyCssValue(textFontFamily),
    '--text-viewer-reading-brightness': `${getTextBrightnessPercentage(textBrightness)}%`
  } as CSSProperties;
  const currentImage = manifest[currentPage] ?? null;
  const footerMessage =
    viewMode === 'audio' || viewMode === 'text'
      ? ''
      : currentImage
      ? currentImage
      : '';
  const displayFooterMessage =
    mainView === 'audio-library' ? 'MP3 Library' : mainView === 'units' ? 'Units' : footerMessage;

  return (
    <main className={`main ${mainView === 'reader' ? 'reader-main-reader' : ''}`}>
      {mainView === 'reader' ? <ReaderContextToolbar /> : null}
      <div
        ref={viewerShellRef}
        style={viewerShellStyle}
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
        {loading ? (
          <div className="reader-state-overlay">
            <ReaderStateCard
              tone="loading"
              title="Opening book"
              description="Loading pages, chapters, and reading progress."
            />
          </div>
        ) : null}
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
