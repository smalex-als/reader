import type { ComponentProps, RefObject } from 'react';
import ChapterEditor from '@/components/ChapterEditor';
import AudioLibraryView from '@/components/AudioLibraryView';
import AudioView from '@/components/AudioView';
import FloatingAudioPlayer from '@/components/FloatingAudioPlayer';
import ChapterViewer from '@/components/ChapterViewer';
import StreamBubble from '@/components/StreamBubble';
import ScrollViewer from '@/components/ScrollViewer';
import UnitsView from '@/components/UnitsView';
import Viewer from '@/components/Viewer';
import {
  selectBookSessionWorkflow,
  selectEditorState,
  selectNavigationState,
  selectReaderSession,
  selectViewerWorkflow,
  useAppSelector
} from '@/state/appState';

type ViewerProps = ComponentProps<typeof Viewer>;
type ScrollViewerProps = ComponentProps<typeof ScrollViewer>;
type ChapterViewerProps = ComponentProps<typeof ChapterViewer>;
type AudioLibraryViewProps = ComponentProps<typeof AudioLibraryView>;
type UnitsViewProps = ComponentProps<typeof UnitsView>;
type StreamBubbleProps = ComponentProps<typeof StreamBubble>;

interface ReaderMainContentProps {
  viewerShellRef: RefObject<HTMLDivElement>;
  modalHostRef: RefObject<HTMLDivElement>;
  footerMessage: string;
  viewerProps: ViewerProps;
  scrollViewerProps: ScrollViewerProps;
  chapterViewerProps: ChapterViewerProps;
  audioLibraryViewProps: AudioLibraryViewProps;
  unitsViewProps: UnitsViewProps;
  streamBubbleProps: StreamBubbleProps;
}

export default function ReaderMainContent({
  viewerShellRef,
  modalHostRef,
  footerMessage,
  viewerProps,
  scrollViewerProps,
  chapterViewerProps,
  audioLibraryViewProps,
  unitsViewProps,
  streamBubbleProps
}: ReaderMainContentProps) {
  const { mainView } = useAppSelector(selectNavigationState);
  const { viewMode } = useAppSelector(selectReaderSession);
  const { loading } = useAppSelector(selectBookSessionWorkflow);
  const { open: editorOpen } = useAppSelector(selectEditorState);
  const {
    settings: { textTheme }
  } = useAppSelector(selectViewerWorkflow);
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
          <AudioLibraryView {...audioLibraryViewProps} />
        ) : mainView === 'units' ? (
          <UnitsView {...unitsViewProps} />
        ) : viewMode === 'pages' ? (
          <Viewer {...viewerProps} />
        ) : viewMode === 'scroll' ? (
          <ScrollViewer {...scrollViewerProps} />
        ) : viewMode === 'text' ? (
          editorOpen ? (
            <ChapterEditor />
          ) : (
            <ChapterViewer {...chapterViewerProps} />
          )
        ) : (
          <AudioView />
        )}
        {loading && <div className="viewer-status">Loading...</div>}
        <StreamBubble {...streamBubbleProps} />
        <FloatingAudioPlayer />
        <div ref={modalHostRef} className="modal-portal" />
      </div>
      <div className="page-footer">
        <span className="page-path">{displayFooterMessage}</span>
      </div>
    </main>
  );
}
