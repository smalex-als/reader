import type { StreamState } from '@/types/app';

export type ToolbarTab = 'reading' | 'image' | 'audio' | 'study' | 'tools';
type StreamVoiceOption = {
  id: string;
  label: string;
};

interface ToolbarProps {
  layout?: 'panel' | 'modal';
  activeTab?: ToolbarTab;
  onTabChange?: (tab: ToolbarTab) => void;
  currentBook: string | null;
  manifestLength: number;
  currentPage: number;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  disablePagesMode: boolean;
  disableScrollMode: boolean;
  disableImageActions: boolean;
  onViewModeChange: (mode: 'pages' | 'scroll' | 'text' | 'audio') => void;
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
  streamState: StreamState;
  streamVoice: string;
  streamVoiceOptions: readonly StreamVoiceOption[];
  onStreamVoiceChange: (voice: string) => void;
  onPlayStream: () => void;
  onStopStream: () => void;
  onCreateChapter: () => void;
  onOpenQuiz: () => void;
  onOpenVocabulary: () => void;
  onOpenMemoryCard: () => void;
  quizDisabled: boolean;
  currentChapterLabel?: string | null;
  gotoInputRef: React.RefObject<HTMLInputElement>;
  onToggleBookmark: () => void;
  onShowBookmarks: () => void;
  onOpenSearch: () => void;
  isBookmarked: boolean;
  bookmarksCount: number;
  onOpenPrint: () => void;
  onShareLink: () => void;
  onOpenHelp: () => void;
  onOpenListeningDashboard: () => void;
  onOpenPromptEditor: () => void;
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
  layout = 'panel',
  activeTab = 'reading',
  onTabChange,
  currentBook,
  manifestLength,
  currentPage,
  viewMode,
  disablePagesMode,
  disableScrollMode,
  disableImageActions,
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
  streamState,
  streamVoice,
  streamVoiceOptions,
  onStreamVoiceChange,
  onPlayStream,
  onStopStream,
  onCreateChapter,
  onOpenQuiz,
  onOpenVocabulary,
  onOpenMemoryCard,
  quizDisabled,
  currentChapterLabel,
  gotoInputRef,
  onToggleBookmark,
  onShowBookmarks,
  onOpenSearch,
  isBookmarked,
  bookmarksCount,
  onOpenPrint,
  onShareLink,
  onOpenHelp,
  onOpenListeningDashboard,
  onOpenPromptEditor,
  onOpenOcrQueue,
  onOpenToc,
  onOpenTocManage,
  ocrQueueTotal,
  ocrQueueProcessed,
  ocrQueueFailed,
  ocrQueueRunning,
  ocrQueuePaused
}: ToolbarProps) {
  const isModal = layout === 'modal';
  const controlsDisabled = manifestLength === 0 || !currentBook;
  const streamActive =
    streamState.status === 'streaming' ||
    streamState.status === 'connecting' ||
    streamState.status === 'paused';
  const streamHandler = streamActive ? onStopStream : onPlayStream;
  const streamLabel = streamActive ? 'Stop Stream' : 'Play Stream';
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
  const showReadingTab = !isModal || activeTab === 'reading';
  const showImageTab = !isModal || activeTab === 'image';
  const showAudioTab = !isModal || activeTab === 'audio';
  const showStudyTab = !isModal || activeTab === 'study';
  const showToolsTab = !isModal || activeTab === 'tools';

  return (
    <div className={`toolbar ${isModal ? 'toolbar-modal' : ''}`}>
      {isModal ? (
        <div className="toolbar-modal-tabs segmented" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            className={`segmented-item ${activeTab === 'reading' ? 'segmented-item-active' : ''}`}
            onClick={() => onTabChange?.('reading')}
            role="tab"
            aria-selected={activeTab === 'reading'}
          >
            Reading
          </button>
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
            className={`segmented-item ${activeTab === 'audio' ? 'segmented-item-active' : ''}`}
            onClick={() => onTabChange?.('audio')}
            role="tab"
            aria-selected={activeTab === 'audio'}
          >
            Audio
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

      {showReadingTab ? (
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
              disabled={manifestLength === 0 || disablePagesMode}
              role="tab"
              aria-selected={viewMode === 'pages'}
            >
              Pages
            </button>
            <button
              type="button"
              className={`segmented-item ${viewMode === 'scroll' ? 'segmented-item-active' : ''}`}
              onClick={() => onViewModeChange('scroll')}
              disabled={manifestLength === 0 || disableScrollMode}
              role="tab"
              aria-selected={viewMode === 'scroll'}
            >
              Scroll
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
            <button
              type="button"
              className={`segmented-item ${viewMode === 'audio' ? 'segmented-item-active' : ''}`}
              onClick={() => onViewModeChange('audio')}
              disabled={manifestLength === 0}
              role="tab"
              aria-selected={viewMode === 'audio'}
            >
              Audio
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
              <button type="button" className="button" onClick={onOpenSearch} disabled={!currentBook}>
                Search
              </button>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {showImageTab ? (
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
          </>
        ) : null}
      </div>
      ) : null}

      {showAudioTab || showStudyTab || showToolsTab ? (
      <div className="toolbar-row">
        {showAudioTab ? (
        <div className="toolbar-group">
          <span className="toolbar-group-title">Stream</span>
          <label className="toolbar-field">
            Voice
            <select
              className="select"
              value={streamVoice}
              disabled={controlsDisabled}
              onChange={(event) => onStreamVoiceChange(event.target.value)}
            >
              {streamVoiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" onClick={streamHandler} disabled={controlsDisabled}>
            {streamLabel}
          </button>
        </div>
        ) : null}

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
            onClick={onOpenListeningDashboard}
          >
            Listening Dashboard
          </button>
          <button
            type="button"
            className="button"
            onClick={onOpenPromptEditor}
          >
            Prompts
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
