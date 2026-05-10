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

type ViewerProps = ComponentProps<typeof Viewer>;
type ScrollViewerProps = ComponentProps<typeof ScrollViewer>;
type ChapterEditorProps = ComponentProps<typeof ChapterEditor>;
type ChapterViewerProps = ComponentProps<typeof ChapterViewer>;
type AudioLibraryViewProps = ComponentProps<typeof AudioLibraryView>;
type UnitsViewProps = ComponentProps<typeof UnitsView>;
type AudioViewProps = ComponentProps<typeof AudioView>;
type StreamBubbleProps = ComponentProps<typeof StreamBubble>;
type FloatingAudioPlayerProps = ComponentProps<typeof FloatingAudioPlayer>;

interface ReaderMainContentProps {
  viewerShellRef: RefObject<HTMLDivElement>;
  modalHostRef: RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  loading: boolean;
  mainView: 'reader' | 'audio-library' | 'units';
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  textTheme: string;
  editorOpen: boolean;
  footerMessage: string;
  viewerProps: ViewerProps;
  scrollViewerProps: ScrollViewerProps;
  chapterEditorProps: ChapterEditorProps;
  chapterViewerProps: ChapterViewerProps;
  audioLibraryViewProps: AudioLibraryViewProps;
  unitsViewProps: UnitsViewProps;
  audioViewProps: AudioViewProps;
  streamBubbleProps: StreamBubbleProps;
  floatingAudioPlayerProps: FloatingAudioPlayerProps;
}

export default function ReaderMainContent({
  viewerShellRef,
  modalHostRef,
  isFullscreen,
  loading,
  mainView,
  viewMode,
  textTheme,
  editorOpen,
  footerMessage,
  viewerProps,
  scrollViewerProps,
  chapterEditorProps,
  chapterViewerProps,
  audioLibraryViewProps,
  unitsViewProps,
  audioViewProps,
  streamBubbleProps,
  floatingAudioPlayerProps
}: ReaderMainContentProps) {
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
            <ChapterEditor {...chapterEditorProps} />
          ) : (
            <ChapterViewer {...chapterViewerProps} />
          )
        ) : (
          <AudioView {...audioViewProps} />
        )}
        {loading && <div className="viewer-status">Loading...</div>}
        <StreamBubble {...streamBubbleProps} />
        <FloatingAudioPlayer {...floatingAudioPlayerProps} />
        <div ref={modalHostRef} className="modal-portal" />
      </div>
      <div className="page-footer">
        <span className="page-path">{footerMessage}</span>
      </div>
    </main>
  );
}
