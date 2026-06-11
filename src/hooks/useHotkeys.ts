import { useEffect, useMemo, type RefObject } from 'react';
import { PAN_PAGE_STEP, PAN_STEP, ZOOM_STEP } from '@/lib/hotkeys';
import {
  appActions,
  selectBookCardOpen,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AppSettings, StreamState, ViewerPan } from '@/types/app';

type ViewMode = 'pages' | 'scroll' | 'text' | 'audio';

type HotkeysOptions = {
  viewMode: ViewMode;
  currentImage: string | null;
  settings: AppSettings;
  updatePan: (pan: ViewerPan) => void;
  updateZoom: (zoom: number, mode?: AppSettings['zoomMode']) => void;
  resetTransform: () => void;
  applyZoomModeWithAlign: (mode: 'fit-width' | 'fit-height') => void;
  updateRotation: () => void;
  applyFilters: (filters: Partial<Pick<AppSettings, 'brightness' | 'contrast' | 'invert'>>) => void;
  toggleTextModal: () => void;
  triggerBackgroundOcr: () => Promise<void> | void;
  toggleOcrEditMode: () => Promise<void> | void;
  setViewMode: (mode: ViewMode) => void;
  handlePrev: () => void;
  handleNext: () => void;
  streamStatus: StreamState['status'];
  handleStopStream: () => void;
  handlePlayStream: () => Promise<void> | void;
  handleToggleStreamPause: () => Promise<void> | void;
  handlePlayNextStudyBlock: () => Promise<void> | void;
  gotoInputRef: RefObject<HTMLInputElement>;
  toggleFullscreen: () => Promise<void> | void;
  onOpenQuiz: () => void;
  onOpenVocabulary: () => void;
  onOpenMemoryCard: () => void;
};

function isTextInput(element: EventTarget | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
}

export function useHotkeys({
  viewMode,
  currentImage,
  settings,
  updatePan,
  updateZoom,
  resetTransform,
  applyZoomModeWithAlign,
  updateRotation,
  applyFilters,
  toggleTextModal,
  triggerBackgroundOcr,
  toggleOcrEditMode,
  setViewMode,
  handlePrev,
  handleNext,
  streamStatus,
  handleStopStream,
  handlePlayStream,
  handleToggleStreamPause,
  handlePlayNextStudyBlock,
  gotoInputRef,
  toggleFullscreen,
  onOpenQuiz,
  onOpenVocabulary,
  onOpenMemoryCard
}: HotkeysOptions) {
  const dispatch = useAppDispatch();
  const textModalOpen = useAppSelector(selectModalOpen('text'));
  const helpOpen = useAppSelector(selectModalOpen('help'));
  const printModalOpen = useAppSelector(selectModalOpen('print'));
  const bookmarksOpen = useAppSelector(selectModalOpen('bookmarks'));
  const searchOpen = useAppSelector(selectModalOpen('search'));
  const ocrQueueOpen = useAppSelector(selectModalOpen('ocrQueue'));
  const settingsOpen = useAppSelector(selectModalOpen('settings'));
  const tocOpen = useAppSelector(selectModalOpen('tocNav'));
  const tocManageOpen = useAppSelector(selectModalOpen('tocManage'));
  const chapterQuizOpen = useAppSelector(selectModalOpen('chapterQuiz'));
  const unitQuizOpen = useAppSelector(selectModalOpen('unitQuiz'));
  const vocabularyOpen = useAppSelector(selectModalOpen('vocabulary'));
  const memoryCardOpen = useAppSelector(selectModalOpen('memoryCard'));
  const bookModalOpen = useAppSelector(selectModalOpen('bookSelect'));
  const imagePreviewOpen = useAppSelector((state) => state.ui.imagePreview !== null);
  const listeningDashboardOpen = useAppSelector(selectModalOpen('listeningDashboard'));
  const promptEditorOpen = useAppSelector(selectModalOpen('promptEditor'));
  const bookCardOpen = useAppSelector(selectBookCardOpen);
  const quizOpen = chapterQuizOpen || unitQuizOpen;
  const hotkeys = useMemo(
    () => [
      { keys: 'Arrow keys', action: 'Pan image' },
      { keys: 'PageUp', action: 'Previous page' },
      { keys: 'K', action: 'Previous page' },
      { keys: 'PageDown', action: 'Next page' },
      { keys: 'J', action: 'Next page' },
      { keys: 'Space', action: 'Pan up' },
      { keys: 'Shift + Space', action: 'Pan down' },
      { keys: '+ / =', action: 'Zoom in' },
      { keys: '-', action: 'Zoom out' },
      { keys: '0', action: 'Open listening dashboard' },
      { keys: 'W', action: 'Fit width' },
      { keys: 'H', action: 'Fit height' },
      { keys: 'R', action: 'Rotate 90°' },
      { keys: 'I', action: 'Invert colors' },
      { keys: 'T', action: 'Toggle page text' },
      { keys: 'O', action: 'Run Deepseek OCR in background' },
      { keys: 'E', action: 'Toggle OCR block edit mode' },
      { keys: '1', action: 'Switch to page view' },
      { keys: '2', action: 'Switch to scroll view' },
      { keys: '3', action: 'Switch to text view' },
      { keys: '7', action: 'Open quiz' },
      { keys: '8', action: 'Open vocabulary' },
      { keys: 'S', action: 'Play/Stop stream audio' },
      { keys: 'P', action: 'Pause/Resume stream audio' },
      { keys: 'N', action: 'Next study block' },
      { keys: 'G', action: 'Focus Go To input' },
      { keys: 'F', action: 'Toggle fullscreen' },
      { keys: 'C', action: 'Open TOC' },
      { keys: 'B', action: 'Open book selector' },
      { keys: ',', action: 'Open settings' },
      { keys: '/', action: 'Open search' },
      { keys: 'Esc', action: 'Close dialogs' },
      { keys: 'Shift + /', action: 'Open help' }
    ],
    []
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const studyModalOpen = quizOpen || vocabularyOpen || memoryCardOpen;
      const allowStudyStreamHotkey =
        studyModalOpen &&
        ((key === 'p' && (streamStatus === 'streaming' || streamStatus === 'paused')) ||
          (key === 'n' && settings.studyMode));
      if (isTextInput(event.target) && event.key !== 'Escape') {
        return;
      }
      if (
        (
          textModalOpen ||
          helpOpen ||
          printModalOpen ||
          bookmarksOpen ||
          searchOpen ||
          bookCardOpen ||
          bookModalOpen ||
          imagePreviewOpen ||
          ocrQueueOpen ||
          tocOpen ||
          tocManageOpen ||
          settingsOpen ||
          quizOpen ||
          vocabularyOpen ||
          memoryCardOpen ||
          listeningDashboardOpen ||
          promptEditorOpen
        ) &&
        event.key !== 'Escape' &&
        !allowStudyStreamHotkey
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      switch (key) {
        case '?':
          event.preventDefault();
          dispatch(appActions.openModal('help'));
          break;
        case 'arrowleft':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x + PAN_STEP, y: settings.pan.y });
          break;
        case 'arrowright':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x - PAN_STEP, y: settings.pan.y });
          break;
        case 'arrowup':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x, y: settings.pan.y + PAN_STEP });
          break;
        case 'arrowdown':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({ x: settings.pan.x, y: settings.pan.y - PAN_STEP });
          break;
        case 'pageup':
        case 'k':
          event.preventDefault();
          handlePrev();
          break;
        case 'pagedown':
        case 'j':
          event.preventDefault();
          handleNext();
          break;
        case ' ':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          updatePan({
            x: settings.pan.x,
            y: settings.pan.y + (event.shiftKey ? PAN_PAGE_STEP : -PAN_PAGE_STEP)
          });
          break;
        case '+':
        case '=':
          event.preventDefault();
          updateZoom(settings.zoom + ZOOM_STEP);
          break;
        case '-':
          event.preventDefault();
          updateZoom(settings.zoom - ZOOM_STEP);
          break;
        case '0':
          event.preventDefault();
          dispatch(appActions.closeModal('settings'));
          dispatch(appActions.openModal('listeningDashboard'));
          break;
        case 'w':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          applyZoomModeWithAlign('fit-width');
          break;
        case 'h':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          applyZoomModeWithAlign('fit-height');
          break;
        case 'r':
          event.preventDefault();
          updateRotation();
          break;
        case 'i':
          event.preventDefault();
          applyFilters({ invert: !settings.invert });
          break;
        case '1':
          event.preventDefault();
          setViewMode('pages');
          break;
        case '2':
          event.preventDefault();
          setViewMode('scroll');
          break;
        case '3':
          event.preventDefault();
          setViewMode('text');
          break;
        case '7':
          event.preventDefault();
          onOpenQuiz();
          break;
        case '8':
          event.preventDefault();
          onOpenVocabulary();
          break;
        case 's':
          event.preventDefault();
          if (streamStatus === 'streaming' || streamStatus === 'connecting' || streamStatus === 'paused') {
            handleStopStream();
          } else {
            void handlePlayStream();
          }
          break;
        case 'p':
          if (streamStatus !== 'streaming' && streamStatus !== 'paused') {
            return;
          }
          event.preventDefault();
          void handleToggleStreamPause();
          break;
        case 'n':
          if (!settings.studyMode) {
            return;
          }
          event.preventDefault();
          void handlePlayNextStudyBlock();
          break;
        case 'g':
          event.preventDefault();
          gotoInputRef.current?.focus();
          break;
        case 't':
          if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage) {
            return;
          }
          event.preventDefault();
          toggleTextModal();
          break;
        case 'o':
          if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage) {
            return;
          }
          event.preventDefault();
          void triggerBackgroundOcr();
          break;
        case 'e':
          if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage) {
            return;
          }
          event.preventDefault();
          void toggleOcrEditMode();
          break;
        case 'c':
          if (event.metaKey || event.ctrlKey) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.openModal('tocNav'));
          break;
        case 'b':
          event.preventDefault();
          dispatch(appActions.openModal('bookSelect'));
          break;
        case ',':
          event.preventDefault();
          dispatch(appActions.openModal('settings'));
          break;
        case '/':
          if (event.shiftKey) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.openModal('search'));
          break;
        case 'f':
          if (event.metaKey || event.ctrlKey) {
            return;
          }
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'escape':
          if (textModalOpen) {
            dispatch(appActions.closeModal('text'));
          }
          if (bookModalOpen) {
            dispatch(appActions.closeModal('bookSelect'));
          }
          if (ocrQueueOpen) {
            dispatch(appActions.closeModal('ocrQueue'));
          }
          if (tocOpen) {
            dispatch(appActions.closeModal('tocNav'));
          }
          if (tocManageOpen) {
            dispatch(appActions.closeModal('tocManage'));
          }
          if (settingsOpen) {
            dispatch(appActions.closeModal('settings'));
          }
          if (helpOpen) {
            dispatch(appActions.closeModal('help'));
          }
          if (printModalOpen) {
            dispatch(appActions.closeModal('print'));
          }
          if (bookmarksOpen) {
            dispatch(appActions.closeModal('bookmarks'));
          }
          if (searchOpen) {
            dispatch(appActions.closeModal('search'));
          }
          if (bookCardOpen) {
            dispatch(appActions.closeBookCard());
          }
          if (promptEditorOpen) {
            dispatch(appActions.closeModal('promptEditor'));
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    applyFilters,
    applyZoomModeWithAlign,
    resetTransform,
    updatePan,
    settings.invert,
    settings.pan.x,
    settings.pan.y,
    settings.zoom,
    handleStopStream,
    handlePlayStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
    textModalOpen,
    updateRotation,
    updateZoom,
    toggleFullscreen,
    handleNext,
    handlePrev,
    setViewMode,
    bookModalOpen,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    searchOpen,
    bookCardOpen,
    imagePreviewOpen,
    dispatch,
    ocrQueueOpen,
    streamStatus,
    viewMode,
    currentImage,
    tocOpen,
    tocManageOpen,
    settingsOpen,
    chapterQuizOpen,
    unitQuizOpen,
    vocabularyOpen,
    memoryCardOpen,
    listeningDashboardOpen,
    promptEditorOpen,
    toggleTextModal,
    triggerBackgroundOcr,
    toggleOcrEditMode,
    gotoInputRef,
    onOpenQuiz,
    onOpenVocabulary,
    onOpenMemoryCard
  ]);

  return { hotkeys };
}
