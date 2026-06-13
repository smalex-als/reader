import {
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectFullscreen,
  selectOcrEdit,
  selectOcrQueueWorkflow,
  selectReaderSession,
  selectSettingsToolbarTab,
  selectViewerWorkflow,
  useAppSelector
} from '@/state/appState';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';

export function useToolbarViewModel() {
  const { bookId: currentBook, viewMode } = useAppSelector(selectReaderSession);
  const settingsToolbarTab = useAppSelector(selectSettingsToolbarTab);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const fullscreen = useAppSelector(selectFullscreen);
  const { editMode: ocrEditMode, saving: ocrEditSaving } = useAppSelector(selectOcrEdit);
  const { queueState: ocrQueueState } = useAppSelector(selectOcrQueueWorkflow);
  const { chapterNumber, chapterLabel } = useCurrentChapterContext();
  const { settings, metrics } = useAppSelector(selectViewerWorkflow);
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const isModal = true;
  const controlsDisabled = navigationCount === 0 || !currentBook;
  const quizDisabled = !currentBook || !chapterNumber;
  const showOcrStatus = ocrQueueState.total > 0;
  const activeTab = isModal ? settingsToolbarTab : 'image';
  const ocrStatusText = getOcrStatusText(ocrQueueState, showOcrStatus);

  return {
    activeTab,
    controlsDisabled,
    currentChapterLabel: chapterNumber ? chapterLabel : null,
    disableImageActions: isTextBook,
    fullscreen,
    isModal,
    metrics,
    ocrEditMode,
    ocrEditSaving,
    ocrQueueState,
    ocrStatusText,
    quizDisabled,
    settings,
    showImageControls: viewMode === 'pages' || viewMode === 'scroll',
    showImageTab: !isModal || activeTab === 'image',
    showOcrStatus,
    showStudyTab: !isModal || activeTab === 'study',
    showToolsTab: !isModal || activeTab === 'tools',
    viewMode
  };
}

function getOcrStatusText(
  ocrQueueState: {
    total: number;
    processed: number;
    failed: number;
    running: boolean;
    paused: boolean;
  },
  showOcrStatus: boolean
) {
  if (!showOcrStatus) {
    return null;
  }
  const statusLabel = ocrQueueState.paused
    ? 'Paused'
    : ocrQueueState.running
      ? 'Running'
      : ocrQueueState.processed < ocrQueueState.total
        ? 'Queued'
        : 'Complete';
  const failedLabel = ocrQueueState.failed > 0 ? ` · ${ocrQueueState.failed} failed` : '';
  return `${statusLabel} · ${ocrQueueState.processed}/${ocrQueueState.total}${failedLabel}`;
}
