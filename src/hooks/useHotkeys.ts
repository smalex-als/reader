import { useCallback, useEffect, type RefObject } from 'react';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { usePageText } from '@/hooks/usePageText';
import { useToast } from '@/hooks/useToast';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import { useViewerTransformControls } from '@/hooks/useZoom';
import { PAN_PAGE_STEP, PAN_STEP, ZOOM_STEP } from '@/lib/hotkeys';
import {
  appActions,
  selectBookSessionWorkflow,
  selectBookCardOpen,
  selectModalOpen,
  selectNavigationState,
  selectReaderSession,
  selectStreamRuntime,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type HotkeysOptions = {
  gotoInputRef: RefObject<HTMLInputElement>;
};

function isTextInput(element: EventTarget | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable;
}

export function useHotkeys({
  gotoInputRef
}: HotkeysOptions) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);
  const { currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { manifest, bookType } = useAppSelector(selectBookSessionWorkflow);
  const {
    settings,
    updatePan,
    updateZoom,
    updateRotation,
    applyFilters
  } = useViewerTransformControls();
  const { fetchPageText, toggleTextModal } = usePageText();
  const streamState = useAppSelector(selectStreamRuntime);
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
  const { openQuiz: openChapterQuiz } = useChapterQuiz();
  const { openQuiz: openUnitTopicQuiz } = useUnitTopicQuiz();
  const { openVocabulary } = useChapterVocabulary();
  const isTextBook = bookType === 'text';
  const currentImage = manifest[currentPage] ?? null;
  const streamStatus = streamState.status;
  const quizOpen = chapterQuizOpen || unitQuizOpen;
  const openQuiz = useCallback(() => {
    dispatch(appActions.closeModal('settings'));
    if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
      void openUnitTopicQuiz();
      return;
    }
    void openChapterQuiz();
  }, [
    dispatch,
    mainView,
    openChapterQuiz,
    openUnitTopicQuiz,
    selectedUnitSetId,
    selectedUnitTopicId
  ]);
  const openVocabularyModal = useCallback(() => {
    dispatch(appActions.closeModal('settings'));
    void openVocabulary();
  }, [dispatch, openVocabulary]);
  const triggerBackgroundOcr = useCallback(async () => {
    if (!currentImage || isTextBook) {
      return;
    }
    showToast('Starting OCR...', 'info');
    const pageText = await fetchPageText({ force: true, silent: true, engine: 'deepseek_ocr' });
    if (pageText) {
      showToast('OCR finished', 'success');
    }
  }, [currentImage, fetchPageText, isTextBook, showToast]);

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
          dispatch(appActions.requestPreviousPageNavigation());
          break;
        case 'pagedown':
        case 'j':
          event.preventDefault();
          dispatch(appActions.requestNextPageNavigation());
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
          dispatch(appActions.requestToolbarFitWidth());
          break;
        case 'h':
          if (viewMode !== 'pages' || !currentImage) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.requestToolbarFitHeight());
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
          if (isTextBook) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.setMainView('reader'));
          dispatch(appActions.setReaderViewMode('pages'));
          break;
        case '2':
          if (isTextBook) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.setMainView('reader'));
          dispatch(appActions.setReaderViewMode('scroll'));
          break;
        case '3':
          event.preventDefault();
          dispatch(appActions.setMainView('reader'));
          dispatch(appActions.setReaderViewMode('text'));
          break;
        case '7':
          event.preventDefault();
          openQuiz();
          break;
        case '8':
          event.preventDefault();
          openVocabularyModal();
          break;
        case 's':
          event.preventDefault();
          if (streamStatus === 'streaming' || streamStatus === 'connecting' || streamStatus === 'paused') {
            dispatch(appActions.requestStopStream());
          } else {
            dispatch(appActions.requestPlayVisibleStream());
          }
          break;
        case 'p':
          if (streamStatus !== 'streaming' && streamStatus !== 'paused') {
            return;
          }
          event.preventDefault();
          dispatch(appActions.requestToggleStreamPause());
          break;
        case 'n':
          if (!settings.studyMode) {
            return;
          }
          event.preventDefault();
          dispatch(appActions.requestPlayNextStudyBlock());
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
          dispatch(appActions.requestToolbarOcrEditToggle());
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
          dispatch(appActions.requestToolbarFullscreenToggle());
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
    updatePan,
    settings.invert,
    settings.pan.x,
    settings.pan.y,
    settings.zoom,
    textModalOpen,
    updateRotation,
    updateZoom,
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
    isTextBook,
    openQuiz,
    openVocabularyModal,
    toggleTextModal,
    triggerBackgroundOcr,
    gotoInputRef
  ]);

}
