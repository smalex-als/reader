import { useEffect, useMemo, type RefObject } from 'react';
import { PAN_PAGE_STEP, PAN_STEP, ZOOM_STEP } from '@/lib/hotkeys';
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
  gotoInputRef: RefObject<HTMLInputElement>;
  toggleFullscreen: () => Promise<void> | void;
  textModalOpen: boolean;
  helpOpen: boolean;
  printModalOpen: boolean;
  bookmarksOpen: boolean;
  searchOpen: boolean;
  bookCardOpen: boolean;
  bookModalOpen: boolean;
  imagePreviewOpen: boolean;
  ocrQueueOpen: boolean;
  tocOpen: boolean;
  tocManageOpen: boolean;
  settingsOpen: boolean;
  quizOpen: boolean;
  vocabularyOpen: boolean;
  memoryCardOpen: boolean;
  listeningDashboardOpen: boolean;
  promptEditorOpen: boolean;
  closeTextModal: () => void;
  closeBookModal: () => void;
  closePrintModal: () => void;
  closeBookmarks: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  closeBookCard: () => void;
  closePromptEditor: () => void;
  setOcrQueueOpen: (open: boolean) => void;
  setTocOpen: (open: boolean) => void;
  setTocManageOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  openHelp: () => void;
  closeHelp: () => void;
  openBookModal: () => void;
  onOpenQuiz: () => void;
  onOpenVocabulary: () => void;
  onOpenMemoryCard: () => void;
  onOpenListeningDashboard: () => void;
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
  gotoInputRef,
  toggleFullscreen,
  textModalOpen,
  helpOpen,
  printModalOpen,
  bookmarksOpen,
  searchOpen,
  bookCardOpen,
  bookModalOpen,
  imagePreviewOpen,
  ocrQueueOpen,
  tocOpen,
  tocManageOpen,
  settingsOpen,
  quizOpen,
  vocabularyOpen,
  memoryCardOpen,
  listeningDashboardOpen,
  promptEditorOpen,
  closeTextModal,
  closeBookModal,
  closePrintModal,
  closeBookmarks,
  openSearch,
  closeSearch,
  closeBookCard,
  closePromptEditor,
  setOcrQueueOpen,
  setTocOpen,
  setTocManageOpen,
  setSettingsOpen,
  openHelp,
  closeHelp,
  openBookModal,
  onOpenQuiz,
  onOpenVocabulary,
  onOpenMemoryCard,
  onOpenListeningDashboard
}: HotkeysOptions) {
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
        event.key !== 'Escape'
      ) {
        return;
      }
      if (isTextInput(event.target) && event.key !== 'Escape') {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        return;
      }
      const key = event.key.toLowerCase();
      switch (key) {
        case '?':
          event.preventDefault();
          openHelp();
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
          onOpenListeningDashboard();
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
          setTocOpen(true);
          break;
        case 'b':
          event.preventDefault();
          openBookModal();
          break;
        case ',':
          event.preventDefault();
          setSettingsOpen(true);
          break;
        case '/':
          if (event.shiftKey) {
            return;
          }
          event.preventDefault();
          openSearch();
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
            closeTextModal();
          }
          if (bookModalOpen) {
            closeBookModal();
          }
          if (ocrQueueOpen) {
            setOcrQueueOpen(false);
          }
          if (tocOpen) {
            setTocOpen(false);
          }
          if (tocManageOpen) {
            setTocManageOpen(false);
          }
          if (settingsOpen) {
            setSettingsOpen(false);
          }
          if (helpOpen) {
            closeHelp();
          }
          if (printModalOpen) {
            closePrintModal();
          }
          if (bookmarksOpen) {
            closeBookmarks();
          }
          if (searchOpen) {
            closeSearch();
          }
          if (bookCardOpen) {
            closeBookCard();
          }
          if (promptEditorOpen) {
            closePromptEditor();
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
    closeTextModal,
    textModalOpen,
    updateRotation,
    updateZoom,
    toggleFullscreen,
    handleNext,
    handlePrev,
    setViewMode,
    bookModalOpen,
    closeBookModal,
    openBookModal,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    searchOpen,
    bookCardOpen,
    imagePreviewOpen,
    closeBookmarks,
    openSearch,
    closeSearch,
    closeBookCard,
    closePromptEditor,
    closePrintModal,
    ocrQueueOpen,
    streamStatus,
    viewMode,
    currentImage,
    tocOpen,
    tocManageOpen,
    settingsOpen,
    quizOpen,
    vocabularyOpen,
    memoryCardOpen,
    listeningDashboardOpen,
    promptEditorOpen,
    setOcrQueueOpen,
    setTocOpen,
    setTocManageOpen,
    setSettingsOpen,
    openHelp,
    closeHelp,
    toggleTextModal,
    triggerBackgroundOcr,
    toggleOcrEditMode,
    gotoInputRef,
    onOpenQuiz,
    onOpenVocabulary,
    onOpenMemoryCard,
    onOpenListeningDashboard
  ]);

  return { hotkeys };
}
