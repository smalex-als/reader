import type { ComponentProps, RefObject } from 'react';
import ChapterEditor from '@/components/ChapterEditor';
import AudioLibraryView from '@/components/AudioLibraryView';
import AudioView from '@/components/AudioView';
import FloatingAudioPlayer from '@/components/FloatingAudioPlayer';
import ChapterViewer from '@/components/ChapterViewer';
import StreamBubble from '@/components/StreamBubble';
import ScrollViewer from '@/components/ScrollViewer';
import Viewer from '@/components/Viewer';

type ViewerProps = ComponentProps<typeof Viewer>;
type ScrollViewerProps = ComponentProps<typeof ScrollViewer>;
type ChapterEditorProps = ComponentProps<typeof ChapterEditor>;
type ChapterViewerProps = ComponentProps<typeof ChapterViewer>;
type AudioLibraryViewProps = ComponentProps<typeof AudioLibraryView>;
type AudioViewProps = ComponentProps<typeof AudioView>;
type StreamBubbleProps = ComponentProps<typeof StreamBubble>;
type FloatingAudioPlayerProps = ComponentProps<typeof FloatingAudioPlayer>;

interface ReaderMainContentProps {
  viewerShellRef: RefObject<HTMLDivElement>;
  modalHostRef: RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  loading: boolean;
  mainView: 'reader' | 'audio-library';
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  textTheme: string;
  editorOpen: boolean;
  footerMessage: string;
  viewerProps: ViewerProps;
  scrollViewerProps: ScrollViewerProps;
  chapterEditorProps: ChapterEditorProps;
  chapterViewerProps: ChapterViewerProps;
  audioLibraryViewProps: AudioLibraryViewProps;
  audioViewProps: AudioViewProps;
  streamBubbleProps: StreamBubbleProps;
  floatingAudioPlayerProps: FloatingAudioPlayerProps;
  onOpenSettings: () => void;
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
  audioViewProps,
  streamBubbleProps,
  floatingAudioPlayerProps,
  onOpenSettings
}: ReaderMainContentProps) {
  return (
    <main className="main">
      <div
        ref={viewerShellRef}
        className={`viewer-shell ${loading ? 'viewer-shell-loading' : ''} ${
          mainView === 'audio-library' || viewMode === 'text' || viewMode === 'audio'
            ? `viewer-shell-text theme-${textTheme}`
            : ''
        }`}
      >
        <button
          type="button"
          className="viewer-settings-trigger"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
            className="viewer-settings-trigger-icon"
          >
            <path
              fill="currentColor"
              d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.42 7.42 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.13.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
        {mainView === 'audio-library' ? (
          <AudioLibraryView {...audioLibraryViewProps} />
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
