export type ToolbarTab = 'image' | 'study' | 'tools';

interface ToolbarProps {
  layout?: 'panel' | 'modal';
  activeTab?: ToolbarTab;
  onTabChange?: (tab: ToolbarTab) => void;
  currentBook: string | null;
  manifestLength: number;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  disableImageActions: boolean;
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
  dimOutsideBlocks: boolean;
  dimOutsideBlocksIntensity: number;
  onBrightness: (value: number) => void;
  onContrast: (value: number) => void;
  onToggleDimOutsideBlocks: () => void;
  onDimOutsideBlocksIntensity: (value: number) => void;
  onToggleTextModal: () => void;
  onToggleOcrEditMode: () => void;
  ocrEditMode: boolean;
  ocrEditSaving: boolean;
  onCopyText: () => void;
  onToggleFullscreen: () => void;
  fullscreen: boolean;
  onCreateChapter: () => void;
  onOpenQuiz: () => void;
  onOpenVocabulary: () => void;
  onOpenMemoryCard: () => void;
  quizDisabled: boolean;
  currentChapterLabel?: string | null;
  onOpenPrint: () => void;
  onShareLink: () => void;
  onOpenHelp: () => void;
  onOpenPromptEditor: () => void;
  onOpenOcrQueue: () => void;
  onOpenJobWorker: () => void;
  onOpenTocManage: () => void;
  ocrQueueTotal: number;
  ocrQueueProcessed: number;
  ocrQueueFailed: number;
  ocrQueueRunning: boolean;
  ocrQueuePaused: boolean;
}

export default function Toolbar({
  layout = 'panel',
  activeTab = 'image',
  onTabChange,
  currentBook,
  manifestLength,
  viewMode,
  disableImageActions,
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
  dimOutsideBlocks,
  dimOutsideBlocksIntensity,
  onBrightness,
  onContrast,
  onToggleDimOutsideBlocks,
  onDimOutsideBlocksIntensity,
  onToggleTextModal,
  onToggleOcrEditMode,
  ocrEditMode,
  ocrEditSaving,
  onCopyText,
  onToggleFullscreen,
  fullscreen,
  onCreateChapter,
  onOpenQuiz,
  onOpenVocabulary,
  onOpenMemoryCard,
  quizDisabled,
  currentChapterLabel,
  onOpenPrint,
  onShareLink,
  onOpenHelp,
  onOpenPromptEditor,
  onOpenOcrQueue,
  onOpenJobWorker,
  onOpenTocManage,
  ocrQueueTotal,
  ocrQueueProcessed,
  ocrQueueFailed,
  ocrQueueRunning,
  ocrQueuePaused
}: ToolbarProps) {
  const isModal = layout === 'modal';
  const controlsDisabled = manifestLength === 0 || !currentBook;
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
  const showImageTab = !isModal || activeTab === 'image';
  const showStudyTab = !isModal || activeTab === 'study';
  const showToolsTab = !isModal || activeTab === 'tools';
  const showImageControls = viewMode === 'pages' || viewMode === 'scroll';

  return (
    <div className={`toolbar ${isModal ? 'toolbar-modal' : ''}`}>
      {isModal ? (
        <div className="toolbar-modal-tabs segmented" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            className={`segmented-item ${activeTab === 'image' ? 'segmented-item-active' : ''}`}
            onClick={() => onTabChange?.('image')}
            role="tab"
            aria-selected={activeTab === 'image'}
          >
            Image
          </button>
          <button
            type="button"
            className={`segmented-item ${activeTab === 'study' ? 'segmented-item-active' : ''}`}
            onClick={() => onTabChange?.('study')}
            role="tab"
            aria-selected={activeTab === 'study'}
          >
            Study
          </button>
          <button
            type="button"
            className={`segmented-item ${activeTab === 'tools' ? 'segmented-item-active' : ''}`}
            onClick={() => onTabChange?.('tools')}
            role="tab"
            aria-selected={activeTab === 'tools'}
          >
            Tools
          </button>
        </div>
      ) : null}

      {showImageTab ? (
      <div className="toolbar-row">
        {viewMode === 'pages' ? (
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
        ) : null}

        {showImageControls ? (
          <div className="toolbar-group">
            <span className="toolbar-group-title">Image</span>
            {viewMode === 'pages' ? (
              <>
                <button type="button" className="button" onClick={onRotate} disabled={controlsDisabled}>
                  Rotate 90°
                </button>
                <span className="toolbar-readout">{rotation}°</span>
              </>
            ) : null}
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
            <button
              type="button"
              className={`button ${dimOutsideBlocks ? 'button-active' : ''}`}
              onClick={onToggleDimOutsideBlocks}
              disabled={controlsDisabled}
            >
              Dim Outside
            </button>
            <span className="toolbar-field">
              Dim level
              <input
                type="range"
                className="slider"
                min={0}
                max={85}
                value={dimOutsideBlocksIntensity}
                disabled={controlsDisabled || !dimOutsideBlocks}
                onChange={(event) => onDimOutsideBlocksIntensity(Number(event.target.value))}
              />
            </span>
          </div>
        ) : null}
      </div>
      ) : null}

      {showStudyTab || showToolsTab ? (
      <div className="toolbar-row">
        {showStudyTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">Study</span>
          <button
            type="button"
            className="button"
            onClick={onOpenQuiz}
            disabled={quizDisabled}
          >
            Open Quiz
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenVocabulary}
            disabled={quizDisabled}
          >
            Open Vocabulary
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenMemoryCard}
            disabled={quizDisabled}
          >
            Open Memory Card
          </button>
          <span className="toolbar-readout">
            {currentChapterLabel ? `For ${currentChapterLabel}` : 'Move to a page inside a chapter'}
          </span>
        </div>
        ) : null}

        {showToolsTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">Text & TOC</span>
          <button
            type="button"
            className="button"
            onClick={onToggleTextModal}
            disabled={controlsDisabled || disableImageActions}
          >
            Page Text
          </button>
          <button
            type="button"
            className={`button ${ocrEditMode ? 'button-active' : ''}`}
            onClick={onToggleOcrEditMode}
            disabled={controlsDisabled || disableImageActions || ocrEditSaving}
          >
            {ocrEditSaving ? 'Saving Blocks…' : ocrEditMode ? 'Finish Blocks' : 'Edit Blocks'}
          </button>
          <button
            type="button"
            className="button"
            onClick={onCopyText}
            disabled={controlsDisabled || disableImageActions}
            title="Copy page text"
          >
            ⧉ Copy Text
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenOcrQueue}
            disabled={controlsDisabled || disableImageActions}
          >
            Batch OCR
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenPromptEditor}
          >
            Prompts
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenJobWorker}
          >
            Jobs
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
          <button
            type="button"
            className="button"
            onClick={onCreateChapter}
            disabled={controlsDisabled || !disableImageActions}
          >
            New Chapter
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenPrint}
            disabled={controlsDisabled || disableImageActions}
          >
            Print PDF
          </button>
        </div>
        ) : null}

        {showToolsTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">System</span>
          <button type="button" className="button" onClick={onShareLink} disabled={controlsDisabled}>
            Share Link
          </button>
          <button type="button" className="button" onClick={onOpenHelp}>
            Help / Hotkeys
          </button>
          <button type="button" className="button" onClick={onToggleFullscreen}>
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
