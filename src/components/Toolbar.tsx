import {
  ToolbarImageSection,
  ToolbarStudySection,
  ToolbarTabs,
  ToolbarToolsSection
} from '@/components/ToolbarSections';
import { useToolbarActions } from '@/hooks/useToolbarActions';
import { useToolbarViewModel } from '@/hooks/useToolbarViewModel';

export default function Toolbar() {
  const {
    activeTab,
    controlsDisabled,
    currentChapterLabel,
    disableImageActions,
    fullscreen,
    isModal,
    metrics,
    ocrEditMode,
    ocrEditSaving,
    ocrQueueState,
    ocrStatusText,
    quizDisabled,
    settings,
    showImageControls,
    showImageTab,
    showOcrStatus,
    showStudyTab,
    showToolsTab,
    viewMode
  } = useToolbarViewModel();
  const {
    applyViewerSettings,
    handleCopyPageText,
    handleCreateBlankChapter,
    handleOpenHelp,
    handleOpenJobWorker,
    handleOpenMemoryCard,
    handleOpenOcrQueue,
    handleOpenPrint,
    handleOpenPromptEditor,
    handleOpenQuiz,
    handleOpenTocManage,
    handleOpenVocabulary,
    handleShareLink,
    handleToggleFullscreen,
    handleToggleOcrEditMode,
    handleToggleTextModal,
    requestFitHeight,
    requestFitWidth,
    resetZoom,
    rotateClockwise,
    setSettingsToolbarTab,
    zoomIn,
    zoomOut
  } = useToolbarActions({ settings, metrics });

  return (
    <div className={`toolbar ${isModal ? 'toolbar-modal' : ''}`}>
      {isModal ? (
        <ToolbarTabs activeTab={activeTab} setSettingsToolbarTab={setSettingsToolbarTab} />
      ) : null}

      {showImageTab ? (
        <ToolbarImageSection
          applyViewerSettings={applyViewerSettings}
          controlsDisabled={controlsDisabled}
          requestFitHeight={requestFitHeight}
          requestFitWidth={requestFitWidth}
          resetZoom={resetZoom}
          rotateClockwise={rotateClockwise}
          settings={settings}
          showImageControls={showImageControls}
          viewMode={viewMode}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
        />
      ) : null}

      {showStudyTab || showToolsTab ? (
        <div className="toolbar-row">
          {showStudyTab ? (
            <ToolbarStudySection
              currentChapterLabel={currentChapterLabel}
              handleOpenMemoryCard={handleOpenMemoryCard}
              handleOpenQuiz={handleOpenQuiz}
              handleOpenVocabulary={handleOpenVocabulary}
              quizDisabled={quizDisabled}
            />
          ) : null}

          {showToolsTab ? (
            <ToolbarToolsSection
              controlsDisabled={controlsDisabled}
              disableImageActions={disableImageActions}
              fullscreen={fullscreen}
              handleCopyPageText={handleCopyPageText}
              handleCreateBlankChapter={handleCreateBlankChapter}
              handleOpenHelp={handleOpenHelp}
              handleOpenJobWorker={handleOpenJobWorker}
              handleOpenOcrQueue={handleOpenOcrQueue}
              handleOpenPrint={handleOpenPrint}
              handleOpenPromptEditor={handleOpenPromptEditor}
              handleOpenTocManage={handleOpenTocManage}
              handleShareLink={handleShareLink}
              handleToggleFullscreen={handleToggleFullscreen}
              handleToggleOcrEditMode={handleToggleOcrEditMode}
              handleToggleTextModal={handleToggleTextModal}
              ocrEditMode={ocrEditMode}
              ocrEditSaving={ocrEditSaving}
              ocrQueueState={ocrQueueState}
              ocrStatusText={ocrStatusText}
              showOcrStatus={showOcrStatus}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
