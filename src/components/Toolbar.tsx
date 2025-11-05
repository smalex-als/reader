interface ToolbarProps {
  books: string[];
  currentBook: string | null;
  manifestLength: number;
  currentPage: number;
  onSelectBook: (bookId: string) => void;
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
  audioStatus: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  onPlayAudio: () => void;
  onStopAudio: () => void;
  gotoInputRef: React.RefObject<HTMLInputElement>;
}

export default function Toolbar({
  books,
  currentBook,
  manifestLength,
  currentPage,
  onSelectBook,
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
  audioStatus,
  onPlayAudio,
  onStopAudio,
  gotoInputRef
}: ToolbarProps) {
  const audioLabel = audioStatus === 'playing' ? 'Pause Audio' : 'Play Audio';
  const audioHandler = audioStatus === 'playing' ? onStopAudio : onPlayAudio;

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <label className="toolbar-field">
          Book
          <select
            className="select"
            value={currentBook ?? ''}
            onChange={(event) => onSelectBook(event.target.value)}
          >
            <option value="" disabled>
              Select book
            </option>
            {books.map((book) => (
              <option key={book} value={book}>
                {book}
              </option>
            ))}
          </select>
        </label>

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
          <button type="button" className="button" onClick={onZoomOut}>
            Zoom -
          </button>
          <button type="button" className="button" onClick={onZoomIn}>
            Zoom +
          </button>
          <button type="button" className="button" onClick={onResetZoom}>
            Reset
          </button>
          <button type="button" className="button" onClick={onFitWidth}>
            Fit Width
          </button>
          <button type="button" className="button" onClick={onFitHeight}>
            Fit Height
          </button>
          <span className="toolbar-readout">Zoom: {(zoom * 100).toFixed(0)}%</span>
        </div>

        <div className="toolbar-group">
          <button type="button" className="button" onClick={onRotate}>
            Rotate 90°
          </button>
          <span className="toolbar-readout">{rotation}°</span>
          <button
            type="button"
            className={`button ${invert ? 'button-active' : ''}`}
            onClick={onInvert}
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
              onChange={(event) => onContrast(Number(event.target.value))}
            />
          </span>
        </div>

        <div className="toolbar-group">
          <button type="button" className="button" onClick={audioHandler} disabled={manifestLength === 0}>
            {audioLabel}
          </button>
          <button type="button" className="button" onClick={onToggleTextModal}>
            Page Text
          </button>
          <button type="button" className="button" onClick={onToggleFullscreen}>
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
    </div>
  );
}
