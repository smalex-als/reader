import type { ComponentProps, RefObject } from 'react';
import ChapterEditor from '@/components/ChapterEditor';
import AudioView from '@/components/AudioView';
import FloatingAudioPlayer from '@/components/FloatingAudioPlayer';
import ChapterViewer from '@/components/ChapterViewer';
import StreamBubble from '@/components/StreamBubble';
import Viewer from '@/components/Viewer';

type ViewerProps = ComponentProps<typeof Viewer>;
type ChapterEditorProps = ComponentProps<typeof ChapterEditor>;
type ChapterViewerProps = ComponentProps<typeof ChapterViewer>;
type AudioViewProps = ComponentProps<typeof AudioView>;
type StreamBubbleProps = ComponentProps<typeof StreamBubble>;
type FloatingAudioPlayerProps = ComponentProps<typeof FloatingAudioPlayer>;

interface ReaderMainContentProps {
  viewerShellRef: RefObject<HTMLDivElement>;
  modalHostRef: RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  loading: boolean;
  viewMode: 'pages' | 'text' | 'audio';
  textTheme: string;
  editorOpen: boolean;
  footerMessage: string;
  viewerProps: ViewerProps;
  chapterEditorProps: ChapterEditorProps;
  chapterViewerProps: ChapterViewerProps;
  audioViewProps: AudioViewProps;
  streamBubbleProps: StreamBubbleProps;
  floatingAudioPlayerProps: FloatingAudioPlayerProps;
}

export default function ReaderMainContent({
  viewerShellRef,
  modalHostRef,
  isFullscreen,
  loading,
  viewMode,
  textTheme,
  editorOpen,
  footerMessage,
  viewerProps,
  chapterEditorProps,
  chapterViewerProps,
  audioViewProps,
  streamBubbleProps,
  floatingAudioPlayerProps
}: ReaderMainContentProps) {
  return (
    <main className="main">
      <div
        ref={viewerShellRef}
        className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''} ${
          viewMode === 'text' || viewMode === 'audio' ? `viewer-shell-text theme-${textTheme}` : ''
        }`}
      >
        {viewMode === 'pages' ? (
          <Viewer {...viewerProps} />
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
