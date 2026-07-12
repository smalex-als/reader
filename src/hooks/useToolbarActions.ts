import { useCallback } from 'react';
import { useChapterActions } from '@/hooks/useBookMutations';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { useCopyActions } from '@/hooks/useCopyActions';
import { usePageText } from '@/hooks/usePageText';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useShareLink } from '@/hooks/useShareLink';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
import {
  appActions,
  selectNavigationState,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AppSettings, ViewerMetrics } from '@/types/app';
import type { AppToolbarTab } from '@/state/appState';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

export function useToolbarActions({
  metrics,
  settings
}: {
  metrics: ViewerMetrics | null;
  settings: AppSettings;
}) {
  const dispatch = useAppDispatch();
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);
  const { openPrintModal } = usePrintOptions();
  const { openQuiz: openChapterQuiz } = useChapterQuiz();
  const { openQuiz: openUnitTopicQuiz } = useUnitTopicQuiz();
  const { openVocabulary } = useChapterVocabulary();
  const { openMemoryCard } = useChapterMemoryCard();
  const { handleCreateChapter } = useChapterActions();
  const { toggleTextModal } = usePageText();
  const { handleCopyText } = useCopyActions();
  const { shareLink } = useShareLink({ trackOpened: false });

  const closeSettings = useCallback(() => {
    dispatch(appActions.closeModal('settings'));
  }, [dispatch]);

  const setSettingsToolbarTab = useCallback(
    (tab: AppToolbarTab) => {
      dispatch(appActions.setSettingsToolbarTab(tab));
    },
    [dispatch]
  );

  const applyViewerSettings = useCallback(
    (nextSettings: Partial<AppSettings>) => {
      dispatch(appActions.setViewerSettings({ ...settings, ...nextSettings }));
    },
    [dispatch, settings]
  );

  const updateTransform = useCallback(
    (partial: Partial<Pick<AppSettings, 'zoom' | 'zoomMode' | 'rotation' | 'pan'>>) => {
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
    },
    [dispatch, metrics, settings]
  );

  const zoomOut = useCallback(() => {
    updateTransform({ zoom: settings.zoom - ZOOM_STEP, zoomMode: 'custom' });
  }, [settings.zoom, updateTransform]);

  const zoomIn = useCallback(() => {
    updateTransform({ zoom: settings.zoom + ZOOM_STEP, zoomMode: 'custom' });
  }, [settings.zoom, updateTransform]);

  const resetZoom = useCallback(() => {
    updateTransform({ zoom: 1, zoomMode: 'custom', rotation: 0, pan: { x: 0, y: 0 } });
  }, [updateTransform]);

  const rotateClockwise = useCallback(() => {
    updateTransform({ rotation: (settings.rotation + 90) % 360, pan: { x: 0, y: 0 } });
  }, [settings.rotation, updateTransform]);

  const requestFitWidth = useCallback(() => {
    dispatch(appActions.requestFitWidth());
  }, [dispatch]);

  const requestFitHeight = useCallback(() => {
    dispatch(appActions.requestFitHeight());
  }, [dispatch]);

  const handleOpenPrint = useCallback(() => {
    closeSettings();
    openPrintModal();
  }, [closeSettings, openPrintModal]);

  const handleOpenHelp = useCallback(() => {
    closeSettings();
    dispatch(appActions.openModal('help'));
  }, [closeSettings, dispatch]);

  const handleOpenPromptEditor = useCallback(() => {
    closeSettings();
    dispatch(appActions.openModal('promptEditor'));
  }, [closeSettings, dispatch]);

  const handleOpenOcrQueue = useCallback(() => {
    dispatch(appActions.openModal('ocrQueue'));
  }, [dispatch]);

  const handleOpenTocManage = useCallback(() => {
    closeSettings();
    dispatch(appActions.openModal('tocManage'));
  }, [closeSettings, dispatch]);

  const handleToggleTextModal = useCallback(() => {
    closeSettings();
    toggleTextModal();
  }, [closeSettings, toggleTextModal]);

  const handleOpenQuiz = useCallback(() => {
    closeSettings();
    if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
      void openUnitTopicQuiz();
      return;
    }
    void openChapterQuiz();
  }, [
    closeSettings,
    mainView,
    openChapterQuiz,
    openUnitTopicQuiz,
    selectedUnitSetId,
    selectedUnitTopicId
  ]);

  const handleOpenVocabulary = useCallback(() => {
    closeSettings();
    void openVocabulary();
  }, [closeSettings, openVocabulary]);

  const handleOpenMemoryCard = useCallback(() => {
    closeSettings();
    void openMemoryCard();
  }, [closeSettings, openMemoryCard]);

  const handleToggleOcrEditMode = useCallback(() => {
    dispatch(appActions.requestToggleOcrEditMode());
  }, [dispatch]);

  const handleToggleFullscreen = useCallback(() => {
    dispatch(appActions.requestToggleFullscreen());
  }, [dispatch]);

  const handleCreateBlankChapter = useCallback(() => {
    void handleCreateChapter({ bookName: '', chapterTitle: '' });
  }, [handleCreateChapter]);

  const handleCopyPageText = useCallback(() => {
    void handleCopyText();
  }, [handleCopyText]);

  const handleShareLink = useCallback(() => {
    void shareLink();
  }, [shareLink]);

  return {
    applyViewerSettings,
    handleCopyPageText,
    handleCreateBlankChapter,
    handleOpenHelp,
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
    updateTransform,
    zoomIn,
    zoomOut
  };
}
