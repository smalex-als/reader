import type { AudioState, StreamState } from '@/types/app';

interface ToolbarProps {
  currentBook: string | null;
  manifestLength: number;
  currentPage: number;
  onOpenBookModal: () => void;
  onPrev: () => void;
  onNext: () => void;
  onGoTo: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onRotate: () => void;
  onInvert: () => void;
  invert: boolean;
  zoom: number;
  rotation: number;
  brightness: number;
  contrast: number;
  onBrightness: (value: number) => void;
  onContrast: (value: number) => void;
  onToggleTextModal: () => void;
  onToggleFullscreen: () => void;
  fullscreen: boolean;
  audioState: AudioState;
  onPlayAudio: () => void;
  onStopAudio: () => void;
  streamState: StreamState;
  streamVoice: string;
  streamVoiceOptions: readonly string[];
  onStreamVoiceChange: (voice: string) => void;
  onPlayStream: () => void;
  onStopStream: () => void;
  gotoInputRef: React.RefObject<HTMLInputElement>;
  onToggleBookmark: () => void;
  onShowBookmarks: () => void;
  isBookmarked: boolean;
  bookmarksCount: number;
  onOpenPrint: () => void;
  onOpenHelp: () => void;
}

export default function Toolbar({
  currentBook,
  manifestLength,
  currentPage,
  onOpenBookModal,
  onPrev,
  onNext,
  onGoTo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitWidth,
  onFitHeight,
  onRotate,
  onInvert,
  invert,
  zoom,
  rotation,
  brightness,
  contrast,
  onBrightness,
  onContrast,
  onToggleTextModal,
  onToggleFullscreen,
  fullscreen,
  audioState,
  onPlayAudio,
  onStopAudio,
  streamState,
  streamVoice,
  streamVoiceOptions,
  onStreamVoiceChange,
  onPlayStream,
  onStopStream,
  gotoInputRef,
  onToggleBookmark,
  onShowBookmarks,
  isBookmarked,
  bookmarksCount,
  onOpenPrint,
  onOpenHelp
}: ToolbarProps) {
  const controlsDisabled = manifestLength === 0 || !currentBook;
  const audioBusy = audioState.status === 'loading' || audioState.status === 'generating';
  const audioHandler = audioState.status === 'playing' ? onStopAudio : onPlayAudio;
  const audioLabel = audioState.status === 'playing' ? 'Stop Audio' : 'Play Audio';
  const streamActive = streamState.status === 'streaming' || streamState.status === 'connecting';
  const streamHandler = streamActive ? onStopStream : onPlayStream;
  const streamLabel = streamActive ? 'Stop Stream' : 'Play Stream';
  const formattedSource = audioState.source ? (audioState.source === 'ai' ? 'AI' : 'file') : null;
  const audioStatusMessage = (() => {
    switch (audioState.status) {
      case 'loading':
        return 'Loading narration…';
      case 'generating':
        return 'Generating narration…';
      case 'playing':
        return `Playing narration${formattedSource ? ` (${formattedSource})` : ''}`;
      case 'paused':
        return `Narration paused${formattedSource ? ` (${formattedSource})` : ''}`;
      case 'error':
        return audioState.error ?? 'Narration unavailable';
      default:
        return null;
    }
  })();
  const showAudioStatus = audioStatusMessage !== null;
  const formatVoiceLabel = (voice: string) => {
    const withoutLocale = voice.startsWith('en-') ? voice.slice(3) : voice;
    const [name, variant] = withoutLocale.split('_');
    return variant ? `${name} - ${variant}` : name;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-group">
          <span className="toolbar-readout">Book: {currentBook ?? 'None selected'}</span>
          <button type="button" className="button" onClick={onOpenBookModal}>
            {currentBook ? 'Change Book' : 'Select Book'}
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" className="button" onClick={onPrev} disabled={manifestLength === 0}>
            Prev
          </button>
          <button type="button" className="button" onClick={onNext} disabled={manifestLength === 0}>
            Next
          </button>
          <span className="toolbar-counter">
            Page {manifestLength === 0 ? 0 : currentPage + 1} / {manifestLength}
          </span>
          <label className="toolbar-field toolbar-goto">
            Go to
            <input
              ref={gotoInputRef}
              min={1}
              max={Math.max(1, manifestLength)}
              type="number"
              className="input"
              placeholder={manifestLength === 0 ? '—' : String(currentPage + 1)}
              disabled={manifestLength === 0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const desired = Number.parseInt(event.currentTarget.value, 10);
                  if (Number.isInteger(desired)) {
                    onGoTo(desired - 1);
                  }
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-group">
          <button type="button" className="button" onClick={onZoomOut} disabled={controlsDisabled}>
            Zoom -
          </button>
          <button type="button" className="button" onClick={onZoomIn} disabled={controlsDisabled}>
            Zoom +
          </button>
          <button type="button" className="button" onClick={onResetZoom} disabled={controlsDisabled}>
            Reset
          </button>
          <button type="button" className="button" onClick={onFitWidth} disabled={controlsDisabled}>
            Fit Width
          </button>
          <button type="button" className="button" onClick={onFitHeight} disabled={controlsDisabled}>
            Fit Height
          </button>
          <span className="toolbar-readout">Zoom: {(zoom * 100).toFixed(0)}%</span>
        </div>

        <div className="toolbar-group">
          <button type="button" className="button" onClick={onRotate} disabled={controlsDisabled}>
            Rotate 90°
          </button>
          <span className="toolbar-readout">{rotation}°</span>
          <button
            type="button"
            className={`button ${invert ? 'button-active' : ''}`}
            onClick={onInvert}
            disabled={controlsDisabled}
          >
            Invert
          </button>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="toolbar-group">
          <span className="toolbar-field">
            Brightness
            <input
              type="range"
              className="slider"
              min={50}
              max={200}
              value={brightness}
              disabled={controlsDisabled}
              onChange={(event) => onBrightness(Number(event.target.value))}
            />
          </span>
          <span className="toolbar-field">
            Contrast
            <input
              type="range"
              className="slider"
              min={50}
              max={200}
              value={contrast}
              disabled={controlsDisabled}
              onChange={(event) => onContrast(Number(event.target.value))}
            />
          </span>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="button"
            onClick={audioHandler}
            disabled={controlsDisabled || audioBusy}
          >
            {audioLabel}
          </button>
          {showAudioStatus && (
            <div className="toolbar-status" role="status" aria-live="polite">
              {audioBusy && <span className="toolbar-spinner" aria-hidden />}
              <span className="toolbar-status-text">{audioStatusMessage}</span>
            </div>
          )}
          <label className="toolbar-field">
            Stream Voice
            <select
              className="select"
              value={streamVoice}
              disabled={controlsDisabled}
              onChange={(event) => onStreamVoiceChange(event.target.value)}
            >
              {streamVoiceOptions.map((voice) => (
                <option key={voice} value={voice}>
                  {formatVoiceLabel(voice)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" onClick={streamHandler} disabled={controlsDisabled}>
            {streamLabel}
          </button>
          <button
            type="button"
            className="button"
            onClick={onToggleTextModal}
            disabled={controlsDisabled}
          >
            Page Text
          </button>
          <button type="button" className="button" onClick={onOpenPrint} disabled={controlsDisabled}>
            Print PDF
          </button>
          <button
            type="button"
            className={`button ${isBookmarked ? 'button-active' : ''}`}
            onClick={onToggleBookmark}
            disabled={controlsDisabled}
          >
            {isBookmarked ? 'Bookmarked' : 'Add Bookmark'}
          </button>
          <button
            type="button"
            className="button"
            onClick={onShowBookmarks}
            disabled={!currentBook}
          >
            Bookmarks ({bookmarksCount})
          </button>
          <button type="button" className="button" onClick={onOpenHelp}>
            Help / Hotkeys
          </button>
          <button type="button" className="button" onClick={onToggleFullscreen}>
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
    </div>
  );
}
