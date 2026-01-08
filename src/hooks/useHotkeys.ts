import { useEffect, useMemo, type RefObject } from 'react';
import { PAN_PAGE_STEP, PAN_STEP, ZOOM_STEP } from '@/lib/hotkeys';
import type { AppSettings, AudioState, StreamState, ViewerPan } from '@/types/app';

type ViewMode = 'pages' | 'text';

type HotkeysOptions = {
  viewMode: ViewMode;
  currentImage: string | null;
  settings: AppSettings;
  updatePan: (pan: ViewerPan) => void;
  updateZoom: (zoom: number) => void;
  resetTransform: () => void;
  applyZoomModeWithAlign: (mode: 'fit-width' | 'fit-height') => void;
  updateRotation: () => void;
  applyFilters: (filters: Partial<Pick<AppSettings, 'brightness' | 'contrast' | 'invert'>>) => void;
  toggleTextModal: () => void;
  toggleViewMode: () => void;
  handlePrev: () => void;
  handleNext: () => void;
  audioStatus: AudioState['status'];
  playAudio: () => Promise<void> | void;
  stopAudio: () => void;
  stopStream: () => void;
  streamStatus: StreamState['status'];
  handleStopStream: () => void;
  handlePlayStream: () => Promise<void> | void;
  gotoInputRef: RefObject<HTMLInputElement>;
  toggleFullscreen: () => Promise<void> | void;
  textModalOpen: boolean;
  helpOpen: boolean;
  printModalOpen: boolean;
  bookmarksOpen: boolean;
  bookModalOpen: boolean;
  ocrQueueOpen: boolean;
  tocOpen: boolean;
  tocManageOpen: boolean;
  closeTextModal: () => void;
  closeBookModal: () => void;
  closePrintModal: () => void;
  closeBookmarks: () => void;
  setOcrQueueOpen: (open: boolean) => void;
  setTocOpen: (open: boolean) => void;
  setTocManageOpen: (open: boolean) => void;
  openHelp: () => void;
  closeHelp: () => void;
  openBookModal: () => void;
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
  toggleViewMode,
  handlePrev,
  handleNext,
  audioStatus,
  playAudio,
  stopAudio,
  stopStream,
  streamStatus,
  handleStopStream,
  handlePlayStream,
  gotoInputRef,
  toggleFullscreen,
  textModalOpen,
  helpOpen,
  printModalOpen,
  bookmarksOpen,
  bookModalOpen,
  ocrQueueOpen,
  tocOpen,
  tocManageOpen,
  closeTextModal,
  closeBookModal,
  closePrintModal,
  closeBookmarks,
  setOcrQueueOpen,
  setTocOpen,
  setTocManageOpen,
  openHelp,
  closeHelp,
  openBookModal
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
      { keys: '0', action: 'Reset zoom/rotation' },
      { keys: 'W', action: 'Fit width' },
      { keys: 'H', action: 'Fit height' },
      { keys: 'R', action: 'Rotate 90°' },
      { keys: 'I', action: 'Invert colors' },
      { keys: 'X', action: 'Toggle page text' },
      { keys: 'V', action: 'Toggle view mode' },
      { keys: 'P', action: 'Play/Pause audio' },
      { keys: 'S', action: 'Play/Stop stream audio' },
      { keys: 'G', action: 'Focus Go To input' },
      { keys: 'F', action: 'Toggle fullscreen' },
      { keys: 'T', action: 'Open TOC' },
      { keys: 'B', action: 'Open book selector' },
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
          bookModalOpen ||
          ocrQueueOpen ||
          tocOpen ||
          tocManageOpen
        ) &&
        event.key !== 'Escape'
      ) {
        return;
      }
      if (isTextInput(event.target) && event.key !== 'Escape') {
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
          resetTransform();
          break;
        case 'w':
          event.preventDefault();
          applyZoomModeWithAlign('fit-width');
          break;
        case 'h':
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
        case 'x':
          event.preventDefault();
          toggleTextModal();
          break;
        case 'v':
          event.preventDefault();
          toggleViewMode();
          break;
        case 'p':
          event.preventDefault();
          if (audioStatus === 'playing') {
            stopAudio();
          } else {
            stopStream();
            void playAudio();
          }
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
          event.preventDefault();
          setTocOpen(true);
          break;
        case 'b':
          event.preventDefault();
          openBookModal();
          break;
        case 'f':
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
          if (helpOpen) {
            closeHelp();
          }
          if (printModalOpen) {
            closePrintModal();
          }
          if (bookmarksOpen) {
            closeBookmarks();
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
    audioStatus,
    playAudio,
    resetTransform,
    updatePan,
    settings.invert,
    settings.pan.x,
    settings.pan.y,
    settings.zoom,
    stopAudio,
    stopStream,
    handleStopStream,
    handlePlayStream,
    closeTextModal,
    textModalOpen,
    updateRotation,
    updateZoom,
    toggleFullscreen,
    handleNext,
    handlePrev,
    toggleViewMode,
    bookModalOpen,
    closeBookModal,
    openBookModal,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    closeBookmarks,
    closePrintModal,
    ocrQueueOpen,
    streamStatus,
    viewMode,
    currentImage,
    tocOpen,
    tocManageOpen,
    setOcrQueueOpen,
    setTocOpen,
    setTocManageOpen,
    openHelp,
    closeHelp,
    toggleTextModal,
    gotoInputRef
  ]);

  return { hotkeys };
}
