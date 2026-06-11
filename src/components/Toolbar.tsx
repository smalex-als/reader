import {
  appActions,
  selectBookSessionWorkflow,
  selectFullscreen,
  selectNavigationState,
  selectOcrEdit,
  selectReaderSession,
  selectSettingsToolbarTab,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useCopyActions } from '@/hooks/useCopyActions';
import { usePageText } from '@/hooks/usePageText';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
import type { AppSettings } from '@/types/app';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

interface ToolbarProps {
  layout?: 'panel' | 'modal';
  onFitWidth: () => void;
  onFitHeight: () => void;
  onToggleOcrEditMode: () => void;
  onToggleFullscreen: () => void;
  onCreateChapter: () => void;
  ocrQueueTotal: number;
  ocrQueueProcessed: number;
  ocrQueueFailed: number;
  ocrQueueRunning: boolean;
  ocrQueuePaused: boolean;
}

export default function Toolbar({
  layout = 'panel',
  onFitWidth,
  onFitHeight,
  onToggleOcrEditMode,
  onToggleFullscreen,
  onCreateChapter,
  ocrQueueTotal,
  ocrQueueProcessed,
  ocrQueueFailed,
  ocrQueueRunning,
  ocrQueuePaused
}: ToolbarProps) {
  const dispatch = useAppDispatch();
  const { bookId: currentBook, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);
  const settingsToolbarTab = useAppSelector(selectSettingsToolbarTab);
  const { bookType, chapterCount, manifest } = useAppSelector(selectBookSessionWorkflow);
  const fullscreen = useAppSelector(selectFullscreen);
  const { editMode: ocrEditMode, saving: ocrEditSaving } = useAppSelector(selectOcrEdit);
  const { chapterNumber, chapterLabel, pageRange: chapterRange } = useCurrentChapterContext();
  const { openPrintModal } = usePrintOptions();
  const { openQuiz: openChapterQuiz } = useChapterQuiz({
    bookId: currentBook,
    chapterNumber,
    chapterRange
  });
  const { openQuiz: openUnitTopicQuiz } = useUnitTopicQuiz({
    unitSetId: selectedUnitSetId,
    topicId: selectedUnitTopicId
  });
  const { openVocabulary } = useChapterVocabulary({
    bookId: currentBook,
    chapterNumber,
    chapterRange
  });
  const { openMemoryCard } = useChapterMemoryCard({
    bookId: currentBook,
    chapterNumber,
    chapterRange
  });
  const { settings, metrics } = useAppSelector(selectViewerWorkflow);
  const {
    invert,
    zoom,
    rotation,
    brightness,
    contrast,
    dimOutsideBlocks,
    dimOutsideBlocksIntensity
  } = settings;
  const isTextBook = bookType === 'text';
  const currentImage = manifest[currentPage] ?? null;
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const { currentText, fetchPageText, toggleTextModal } = usePageText(currentImage);
  const { handleCopyText } = useCopyActions({
    currentImage,
    currentText,
    fetchPageText
  });
  const { shareLink } = useShareLink({
    bookId: currentBook,
    currentPage,
    navigationCount,
    viewMode,
    trackOpened: false
  });
  const manifestLength = navigationCount;
  const disableImageActions = isTextBook;
  const isModal = layout === 'modal';
  const controlsDisabled = manifestLength === 0 || !currentBook;
  const quizDisabled = !currentBook || !chapterNumber;
  const currentChapterLabel = chapterNumber ? chapterLabel : null;
  const showOcrStatus = ocrQueueTotal > 0;
  const activeTab = isModal ? settingsToolbarTab : 'image';
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
  const closeSettings = () => dispatch(appActions.closeModal('settings'));
  const applyViewerSettings = (nextSettings: Partial<typeof settings>) => {
    dispatch(appActions.setViewerSettings({ ...settings, ...nextSettings }));
  };
  const updateTransform = (partial: Partial<Pick<AppSettings, 'zoom' | 'zoomMode' | 'rotation' | 'pan'>>) => {
    const requestedZoom = partial.zoom ?? settings.zoom;
    const clampedZoom = clamp(requestedZoom, ZOOM_MIN, ZOOM_MAX);
    const basePan = partial.pan ?? settings.pan;
    const panMetrics = metrics ? { ...metrics, scale: clampedZoom } : null;
    const nextPan = panMetrics ? clampPan(basePan, panMetrics) : basePan;
    dispatch(appActions.setViewerSettings({
      ...settings,
      ...partial,
      zoom: clampedZoom,
      zoomMode: partial.zoomMode ?? settings.zoomMode,
      rotation: partial.rotation ?? settings.rotation,
      pan: nextPan
    }));
  };
  const handleOpenPrint = () => {
    closeSettings();
    openPrintModal();
  };
  const handleOpenHelp = () => {
    closeSettings();
    dispatch(appActions.openModal('help'));
  };
  const handleOpenPromptEditor = () => {
    closeSettings();
    dispatch(appActions.openModal('promptEditor'));
  };
  const handleOpenOcrQueue = () => {
    dispatch(appActions.openModal('ocrQueue'));
  };
  const handleOpenJobWorker = () => {
    closeSettings();
    dispatch(appActions.openModal('jobWorker'));
  };
  const handleOpenTocManage = () => {
    closeSettings();
    dispatch(appActions.openModal('tocManage'));
  };
  const handleToggleTextModal = () => {
    closeSettings();
    toggleTextModal();
  };
  const handleOpenQuiz = () => {
    closeSettings();
    if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
      void openUnitTopicQuiz();
      return;
    }
    void openChapterQuiz();
  };
  const handleOpenVocabulary = () => {
    closeSettings();
    void openVocabulary();
  };
  const handleOpenMemoryCard = () => {
    closeSettings();
    void openMemoryCard();
  };

  return (
    <div className={`toolbar ${isModal ? 'toolbar-modal' : ''}`}>
      {isModal ? (
        <div className="toolbar-modal-tabs segmented" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            className={`segmented-item ${activeTab === 'image' ? 'segmented-item-active' : ''}`}
            onClick={() => dispatch(appActions.setSettingsToolbarTab('image'))}
            role="tab"
            aria-selected={activeTab === 'image'}
          >
            Image
          </button>
          <button
            type="button"
            className={`segmented-item ${activeTab === 'study' ? 'segmented-item-active' : ''}`}
            onClick={() => dispatch(appActions.setSettingsToolbarTab('study'))}
            role="tab"
            aria-selected={activeTab === 'study'}
          >
            Study
          </button>
          <button
            type="button"
            className={`segmented-item ${activeTab === 'tools' ? 'segmented-item-active' : ''}`}
            onClick={() => dispatch(appActions.setSettingsToolbarTab('tools'))}
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
                onClick={() => updateTransform({ zoom: zoom - ZOOM_STEP, zoomMode: 'custom' })}
                disabled={controlsDisabled}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="button"
                onClick={() => updateTransform({ zoom: zoom + ZOOM_STEP, zoomMode: 'custom' })}
                disabled={controlsDisabled}
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                className="button"
                onClick={() => updateTransform({ zoom: 1, zoomMode: 'custom', rotation: 0, pan: { x: 0, y: 0 } })}
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
                <button
                  type="button"
                  className="button"
                  onClick={() => updateTransform({ rotation: (rotation + 90) % 360, pan: { x: 0, y: 0 } })}
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
      ) : null}

      {showStudyTab || showToolsTab ? (
      <div className="toolbar-row">
        {showStudyTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">Study</span>
          <button
            type="button"
            className="button"
            onClick={handleOpenQuiz}
            disabled={quizDisabled}
          >
            Open Quiz
          </button>
          <button
            type="button"
            className="button"
            onClick={handleOpenVocabulary}
            disabled={quizDisabled}
          >
            Open Vocabulary
          </button>
          <button
            type="button"
            className="button"
            onClick={handleOpenMemoryCard}
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
            onClick={handleToggleTextModal}
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
            onClick={() => void handleCopyText()}
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
          <button
            type="button"
            className="button"
            onClick={handleOpenPromptEditor}
          >
            Prompts
          </button>
          <button
            type="button"
            className="button"
            onClick={handleOpenJobWorker}
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
            onClick={handleOpenTocManage}
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
            onClick={handleOpenPrint}
            disabled={controlsDisabled || disableImageActions}
          >
            Print PDF
          </button>
        </div>
        ) : null}

        {showToolsTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">System</span>
          <button type="button" className="button" onClick={() => void shareLink()} disabled={controlsDisabled}>
            Share Link
          </button>
          <button type="button" className="button" onClick={handleOpenHelp}>
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
