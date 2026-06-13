import { clamp } from '@/lib/math';
import type { AppToolbarTab } from '@/state/appState';
import type { AppSettings, OcrQueueState } from '@/types/app';
import type { ViewMode } from '@/lib/appConstants';

type ToolbarTabsProps = {
  activeTab: AppToolbarTab;
  setSettingsToolbarTab: (tab: AppToolbarTab) => void;
};

export function ToolbarTabs({ activeTab, setSettingsToolbarTab }: ToolbarTabsProps) {
  return (
    <div className="toolbar-modal-tabs segmented" role="tablist" aria-label="Settings sections">
      <button
        type="button"
        className={`segmented-item ${activeTab === 'image' ? 'segmented-item-active' : ''}`}
        onClick={() => setSettingsToolbarTab('image')}
        role="tab"
        aria-selected={activeTab === 'image'}
      >
        Image
      </button>
      <button
        type="button"
        className={`segmented-item ${activeTab === 'study' ? 'segmented-item-active' : ''}`}
        onClick={() => setSettingsToolbarTab('study')}
        role="tab"
        aria-selected={activeTab === 'study'}
      >
        Study
      </button>
      <button
        type="button"
        className={`segmented-item ${activeTab === 'tools' ? 'segmented-item-active' : ''}`}
        onClick={() => setSettingsToolbarTab('tools')}
        role="tab"
        aria-selected={activeTab === 'tools'}
      >
        Tools
      </button>
    </div>
  );
}

type ToolbarImageSectionProps = {
  applyViewerSettings: (settings: Partial<AppSettings>) => void;
  controlsDisabled: boolean;
  requestFitHeight: () => void;
  requestFitWidth: () => void;
  resetZoom: () => void;
  rotateClockwise: () => void;
  settings: AppSettings;
  showImageControls: boolean;
  viewMode: ViewMode;
  zoomIn: () => void;
  zoomOut: () => void;
};

export function ToolbarImageSection({
  applyViewerSettings,
  controlsDisabled,
  requestFitHeight,
  requestFitWidth,
  resetZoom,
  rotateClockwise,
  settings,
  showImageControls,
  viewMode,
  zoomIn,
  zoomOut
}: ToolbarImageSectionProps) {
  const {
    brightness,
    contrast,
    dimOutsideBlocks,
    dimOutsideBlocksIntensity,
    invert,
    rotation,
    zoom
  } = settings;

  return (
    <div className="toolbar-row">
      {viewMode === 'pages' ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">Zoom</span>
          <div className="toolbar-zoom-row">
            <button
              type="button"
              className="button"
              onClick={zoomOut}
              disabled={controlsDisabled}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="button"
              onClick={zoomIn}
              disabled={controlsDisabled}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="button"
              onClick={resetZoom}
              disabled={controlsDisabled}
              aria-label="Reset zoom"
            >
              100%
            </button>
          </div>
          <button
            type="button"
            className="button"
            onClick={requestFitWidth}
            disabled={controlsDisabled}
            aria-label="Fit width"
          >
            ↔
          </button>
          <button
            type="button"
            className="button"
            onClick={requestFitHeight}
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
              <button
                type="button"
                className="button"
                onClick={rotateClockwise}
                disabled={controlsDisabled}
              >
                Rotate 90°
              </button>
              <span className="toolbar-readout">{rotation}°</span>
            </>
          ) : null}
          <button
            type="button"
            className={`button ${invert ? 'button-active' : ''}`}
            onClick={() => applyViewerSettings({ invert: !invert })}
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
              onChange={(event) => applyViewerSettings({ brightness: Number(event.target.value) })}
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
              onChange={(event) => applyViewerSettings({ contrast: Number(event.target.value) })}
            />
          </span>
          <button
            type="button"
            className={`button ${dimOutsideBlocks ? 'button-active' : ''}`}
            onClick={() => applyViewerSettings({ dimOutsideBlocks: !dimOutsideBlocks })}
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
              onChange={(event) =>
                applyViewerSettings({ dimOutsideBlocksIntensity: clamp(Number(event.target.value), 0, 85) })
              }
            />
          </span>
        </div>
      ) : null}
    </div>
  );
}

type ToolbarStudySectionProps = {
  currentChapterLabel: string | null;
  handleOpenMemoryCard: () => void;
  handleOpenQuiz: () => void;
  handleOpenVocabulary: () => void;
  quizDisabled: boolean;
};

export function ToolbarStudySection({
  currentChapterLabel,
  handleOpenMemoryCard,
  handleOpenQuiz,
  handleOpenVocabulary,
  quizDisabled
}: ToolbarStudySectionProps) {
  return (
    <div className="toolbar-group">
      <span className="toolbar-group-title">Study</span>
      <button type="button" className="button" onClick={handleOpenQuiz} disabled={quizDisabled}>
        Open Quiz
      </button>
      <button type="button" className="button" onClick={handleOpenVocabulary} disabled={quizDisabled}>
        Open Vocabulary
      </button>
      <button type="button" className="button" onClick={handleOpenMemoryCard} disabled={quizDisabled}>
        Open Memory Card
      </button>
      <span className="toolbar-readout">
        {currentChapterLabel ? `For ${currentChapterLabel}` : 'Move to a page inside a chapter'}
      </span>
    </div>
  );
}

type ToolbarToolsSectionProps = {
  controlsDisabled: boolean;
  disableImageActions: boolean;
  fullscreen: boolean;
  handleCopyPageText: () => void;
  handleCreateBlankChapter: () => void;
  handleOpenHelp: () => void;
  handleOpenJobWorker: () => void;
  handleOpenOcrQueue: () => void;
  handleOpenPrint: () => void;
  handleOpenPromptEditor: () => void;
  handleOpenTocManage: () => void;
  handleShareLink: () => void;
  handleToggleFullscreen: () => void;
  handleToggleOcrEditMode: () => void;
  handleToggleTextModal: () => void;
  ocrEditMode: boolean;
  ocrEditSaving: boolean;
  ocrQueueState: OcrQueueState;
  ocrStatusText: string | null;
  showOcrStatus: boolean;
};

export function ToolbarToolsSection({
  controlsDisabled,
  disableImageActions,
  fullscreen,
  handleCopyPageText,
  handleCreateBlankChapter,
  handleOpenHelp,
  handleOpenJobWorker,
  handleOpenOcrQueue,
  handleOpenPrint,
  handleOpenPromptEditor,
  handleOpenTocManage,
  handleShareLink,
  handleToggleFullscreen,
  handleToggleOcrEditMode,
  handleToggleTextModal,
  ocrEditMode,
  ocrEditSaving,
  ocrQueueState,
  ocrStatusText,
  showOcrStatus
}: ToolbarToolsSectionProps) {
  return (
    <>
      <div className="toolbar-group">
        <span className="toolbar-group-title">Text & TOC</span>
        <button
          type="button"
          className="button"
          onClick={handleToggleTextModal}
          disabled={controlsDisabled || disableImageActions}
        >
          Page Text
        </button>
        <button
          type="button"
          className={`button ${ocrEditMode ? 'button-active' : ''}`}
          onClick={handleToggleOcrEditMode}
          disabled={controlsDisabled || disableImageActions || ocrEditSaving}
        >
          {ocrEditSaving ? 'Saving Blocks…' : ocrEditMode ? 'Finish Blocks' : 'Edit Blocks'}
        </button>
        <button
          type="button"
          className="button"
          onClick={handleCopyPageText}
          disabled={controlsDisabled || disableImageActions}
          title="Copy page text"
        >
          ⧉ Copy Text
        </button>
        <button
          type="button"
          className="button"
          onClick={handleOpenOcrQueue}
          disabled={controlsDisabled || disableImageActions}
        >
          Batch OCR
        </button>
        <button type="button" className="button" onClick={handleOpenPromptEditor}>
          Prompts
        </button>
        <button type="button" className="button" onClick={handleOpenJobWorker}>
          Jobs
        </button>
        {showOcrStatus && (
          <div className="toolbar-status" role="status" aria-live="polite">
            {ocrQueueState.running && !ocrQueueState.paused && <span className="toolbar-spinner" aria-hidden />}
            <span className="toolbar-status-text">{ocrStatusText}</span>
          </div>
        )}
        <button
          type="button"
          className="button button-secondary"
          onClick={handleOpenTocManage}
          disabled={controlsDisabled}
        >
          Edit TOC
        </button>
        <button
          type="button"
          className="button"
          onClick={handleCreateBlankChapter}
          disabled={controlsDisabled || !disableImageActions}
        >
          New Chapter
        </button>
        <button
          type="button"
          className="button"
          onClick={handleOpenPrint}
          disabled={controlsDisabled || disableImageActions}
        >
          Print PDF
        </button>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-group-title">System</span>
        <button type="button" className="button" onClick={handleShareLink} disabled={controlsDisabled}>
          Share Link
        </button>
        <button type="button" className="button" onClick={handleOpenHelp}>
          Help / Hotkeys
        </button>
        <button type="button" className="button" onClick={handleToggleFullscreen}>
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>
    </>
  );
}
