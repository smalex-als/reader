import type { AudioState, StreamState } from '@/types/app';

interface ToolbarProps {
  currentBook: string | null;
  manifestLength: number;
  currentPage: number;
  viewMode: 'pages' | 'text';
  onViewModeChange: (mode: 'pages' | 'text') => void;
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
  onCopyText: () => void;
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
  onOpenOcrQueue: () => void;
  onOpenToc: () => void;
  onOpenTocManage: () => void;
  ocrQueueTotal: number;
  ocrQueueProcessed: number;
  ocrQueueFailed: number;
  ocrQueueRunning: boolean;
  ocrQueuePaused: boolean;
}

export default function Toolbar({
  currentBook,
  manifestLength,
  currentPage,
  viewMode,
  onViewModeChange,
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
  onCopyText,
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
  onOpenHelp,
  onOpenOcrQueue,
  onOpenToc,
  onOpenTocManage,
  ocrQueueTotal,
  ocrQueueProcessed,
  ocrQueueFailed,
  ocrQueueRunning,
  ocrQueuePaused
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
        return 'Loading audio…';
      case 'generating':
        return 'Generating audio…';
      case 'playing':
        return `Playing audio${formattedSource ? ` (${formattedSource})` : ''}`;
      case 'paused':
        return `Audio paused${formattedSource ? ` (${formattedSource})` : ''}`;
      case 'error':
        return audioState.error ?? 'Audio unavailable';
      default:
        return null;
    }
  })();
  const showAudioStatus = audioStatusMessage !== null;
  const showOcrStatus = ocrQueueTotal > 0;
  const ocrStatusText = (() => {
    if (!showOcrStatus) {
      return null;
    }
    const statusLabel = ocrQueuePaused
      ? 'Paused'
      : ocrQueueRunning
      ? 'Running'
      : ocrQueueProcessed < ocrQueueTotal
      ? 'Queued'
      : 'Complete';
    const failedLabel = ocrQueueFailed > 0 ? ` · ${ocrQueueFailed} failed` : '';
    return `${statusLabel} · ${ocrQueueProcessed}/${ocrQueueTotal}${failedLabel}`;
  })();
  const formatVoiceLabel = (voice: string) => {
    const withoutLocale = voice.startsWith('en-') ? voice.slice(3) : voice;
    const [name, variant] = withoutLocale.split('_');
    return variant ? `${name} - ${variant}` : name;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-group">
          <span className="toolbar-group-title">Library</span>
          <span className="toolbar-readout">{currentBook ?? 'None selected'}</span>
          <button type="button" className="button" onClick={onOpenBookModal}>
            {currentBook ? 'Change Book' : 'Select Book'}
          </button>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-group-title">Mode</span>
          <div className="segmented" role="tablist" aria-label="Reading mode">
            <button
              type="button"
              className={`segmented-item ${viewMode === 'pages' ? 'segmented-item-active' : ''}`}
              onClick={() => onViewModeChange('pages')}
              disabled={manifestLength === 0}
              role="tab"
              aria-selected={viewMode === 'pages'}
            >
              Pages
            </button>
            <button
              type="button"
              className={`segmented-item ${viewMode === 'text' ? 'segmented-item-active' : ''}`}
              onClick={() => onViewModeChange('text')}
              disabled={manifestLength === 0}
              role="tab"
              aria-selected={viewMode === 'text'}
            >
              Text
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-group-title">Navigation</span>
          <div className="toolbar-nav toolbar-nav-stack">
            <div className="toolbar-nav-actions">
              <button type="button" className="button" onClick={onPrev} disabled={manifestLength === 0}>
                &lt;
              </button>
              <span className="toolbar-counter toolbar-nav-counter">
                {manifestLength === 0 ? '0 / 0' : `${currentPage + 1} / ${manifestLength}`}
              </span>
              <button type="button" className="button" onClick={onNext} disabled={manifestLength === 0}>
                &gt;
              </button>
            </div>
            <div className="toolbar-nav-row toolbar-nav-row-full">
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
            <div className="toolbar-nav-row">
              <button
                type="button"
                className="button"
                onClick={onOpenToc}
                disabled={controlsDisabled}
              >
                ☰
              </button>
              <button
                type="button"
                className={`button ${isBookmarked ? 'button-active' : ''}`}
                onClick={onToggleBookmark}
                disabled={controlsDisabled}
              >
                {isBookmarked ? '★' : '☆'}
              </button>
              <button type="button" className="button" onClick={onShowBookmarks} disabled={!currentBook}>
                ★ ({bookmarksCount})
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar-row">
        {viewMode === 'pages' ? (
          <>
            <div className="toolbar-group">
          <span className="toolbar-group-title">Zoom</span>
          <div className="toolbar-zoom-row">
            <button
              type="button"
              className="button"
              onClick={onZoomOut}
              disabled={controlsDisabled}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="button"
              onClick={onZoomIn}
              disabled={controlsDisabled}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="button"
              onClick={onResetZoom}
              disabled={controlsDisabled}
              aria-label="Reset zoom"
            >
              100%
            </button>
          </div>
          <button
            type="button"
            className="button"
            onClick={onFitWidth}
            disabled={controlsDisabled}
            aria-label="Fit width"
          >
            ↔
          </button>
          <button
            type="button"
            className="button"
            onClick={onFitHeight}
            disabled={controlsDisabled}
            aria-label="Fit height"
          >
            ↕
          </button>
              <span className="toolbar-readout">Zoom: {(zoom * 100).toFixed(0)}%</span>
            </div>

            <div className="toolbar-group">
              <span className="toolbar-group-title">Image</span>
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
          </>
        ) : null}
      </div>

      <div className="toolbar-row">
        {false ? (
          <div className="toolbar-group">
            <span className="toolbar-group-title">Audio</span>
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
          </div>
        ) : null}

        <div className="toolbar-group">
          <span className="toolbar-group-title">Stream</span>
          <label className="toolbar-field">
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
        </div>

        <div className="toolbar-group">
          <span className="toolbar-group-title">Text & TOC</span>
          <button
            type="button"
            className="button"
            onClick={onToggleTextModal}
            disabled={controlsDisabled}
          >
            Page Text
          </button>
          <button
            type="button"
            className="button"
            onClick={onCopyText}
            disabled={controlsDisabled}
            title="Copy OCR text"
          >
            ⧉ Copy Text
          </button>
          <button type="button" className="button" onClick={onOpenOcrQueue} disabled={controlsDisabled}>
            Batch OCR
          </button>
          {showOcrStatus && (
            <div className="toolbar-status" role="status" aria-live="polite">
              {ocrQueueRunning && !ocrQueuePaused && <span className="toolbar-spinner" aria-hidden />}
              <span className="toolbar-status-text">{ocrStatusText}</span>
            </div>
          )}
          <button
            type="button"
            className="button button-secondary"
            onClick={onOpenTocManage}
            disabled={controlsDisabled}
          >
            Edit TOC
          </button>
          <button type="button" className="button" onClick={onOpenPrint} disabled={controlsDisabled}>
            Print PDF
          </button>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-group-title">System</span>
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
