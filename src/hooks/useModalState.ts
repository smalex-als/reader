import { useCallback } from 'react';
import {
  appActions,
  selectBookCardBookId,
  selectBookCardOpen,
  selectEditorState,
  selectModalOpen,
  useAppDispatch,
  useAppSelector,
  type ChapterEditorTextVersion,
  type SimpleModal
} from '@/state/appState';

type BooleanSetter = (next: boolean | ((prev: boolean) => boolean)) => void;
type NullableStringSetter = (next: string | null | ((prev: string | null) => string | null)) => void;
type NullableNumberSetter = (next: number | null | ((prev: number | null) => number | null)) => void;
type EditorTextVersionSetter = (
  next: ChapterEditorTextVersion | null | ((prev: ChapterEditorTextVersion | null) => ChapterEditorTextVersion | null)
) => void;

function resolveNext<T>(next: T | ((prev: T) => T), current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useModalState() {
  const dispatch = useAppDispatch();
  const helpOpen = useAppSelector(selectModalOpen('help'));
  const listeningDashboardOpen = useAppSelector(selectModalOpen('listeningDashboard'));
  const ocrQueueOpen = useAppSelector(selectModalOpen('ocrQueue'));
  const jobWorkerOpen = useAppSelector(selectModalOpen('jobWorker'));
  const searchOpen = useAppSelector(selectModalOpen('search'));
  const promptEditorOpen = useAppSelector(selectModalOpen('promptEditor'));
  const settingsOpen = useAppSelector(selectModalOpen('settings'));
  const bookCardOpen = useAppSelector(selectBookCardOpen);
  const bookCardBookId = useAppSelector(selectBookCardBookId);
  const editorState = useAppSelector(selectEditorState);
  const editorOpen = editorState.open;
  const editorChapterNumber = editorState.chapterNumber;
  const editorTextVersion = editorState.textVersion;

  const setModalOpen = useCallback(
    (modal: SimpleModal, currentOpen: boolean, next: boolean | ((prev: boolean) => boolean)) => {
      dispatch(appActions.setModalOpen(modal, resolveNext(next, currentOpen)));
    },
    [dispatch]
  );

  const setHelpOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('help', helpOpen, next),
    [helpOpen, setModalOpen]
  );
  const openHelp = useCallback(() => dispatch(appActions.openModal('help')), [dispatch]);
  const closeHelp = useCallback(() => dispatch(appActions.closeModal('help')), [dispatch]);
  const setListeningDashboardOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('listeningDashboard', listeningDashboardOpen, next),
    [listeningDashboardOpen, setModalOpen]
  );
  const openListeningDashboard = useCallback(
    () => dispatch(appActions.openModal('listeningDashboard')),
    [dispatch]
  );
  const closeListeningDashboard = useCallback(
    () => dispatch(appActions.closeModal('listeningDashboard')),
    [dispatch]
  );
  const setOcrQueueOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('ocrQueue', ocrQueueOpen, next),
    [ocrQueueOpen, setModalOpen]
  );
  const openOcrQueue = useCallback(() => dispatch(appActions.openModal('ocrQueue')), [dispatch]);
  const closeOcrQueue = useCallback(() => dispatch(appActions.closeModal('ocrQueue')), [dispatch]);
  const setJobWorkerOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('jobWorker', jobWorkerOpen, next),
    [jobWorkerOpen, setModalOpen]
  );
  const openJobWorker = useCallback(() => dispatch(appActions.openModal('jobWorker')), [dispatch]);
  const closeJobWorker = useCallback(() => dispatch(appActions.closeModal('jobWorker')), [dispatch]);
  const setSearchOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('search', searchOpen, next),
    [searchOpen, setModalOpen]
  );
  const openSearch = useCallback(() => dispatch(appActions.openModal('search')), [dispatch]);
  const closeSearch = useCallback(() => dispatch(appActions.closeModal('search')), [dispatch]);
  const setPromptEditorOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('promptEditor', promptEditorOpen, next),
    [promptEditorOpen, setModalOpen]
  );
  const openPromptEditor = useCallback(() => dispatch(appActions.openModal('promptEditor')), [dispatch]);
  const closePromptEditor = useCallback(() => dispatch(appActions.closeModal('promptEditor')), [dispatch]);
  const setSettingsOpen: BooleanSetter = useCallback(
    (next) => setModalOpen('settings', settingsOpen, next),
    [settingsOpen, setModalOpen]
  );
  const setBookCardOpen: BooleanSetter = useCallback(
    (next) => dispatch(appActions.setBookCardOpen(resolveNext(next, bookCardOpen))),
    [bookCardOpen, dispatch]
  );
  const setBookCardBookId: NullableStringSetter = useCallback(
    (next) => dispatch(appActions.setBookCardBookId(resolveNext(next, bookCardBookId))),
    [bookCardBookId, dispatch]
  );
  const setEditorOpen: BooleanSetter = useCallback(
    (next) => dispatch(appActions.setEditorOpen(resolveNext(next, editorOpen))),
    [dispatch, editorOpen]
  );
  const setEditorChapterNumber: NullableNumberSetter = useCallback(
    (next) => dispatch(appActions.setEditorChapterNumber(resolveNext(next, editorChapterNumber))),
    [dispatch, editorChapterNumber]
  );
  const setEditorTextVersion: EditorTextVersionSetter = useCallback(
    (next) => dispatch(appActions.setEditorTextVersion(resolveNext(next, editorTextVersion))),
    [dispatch, editorTextVersion]
  );

  const openBookCard = useCallback((bookId: string) => dispatch(appActions.openBookCard(bookId)), [dispatch]);
  const closeBookCard = useCallback(() => dispatch(appActions.closeBookCard()), [dispatch]);

  return {
    helpOpen,
    setHelpOpen,
    openHelp,
    closeHelp,
    listeningDashboardOpen,
    setListeningDashboardOpen,
    openListeningDashboard,
    closeListeningDashboard,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    jobWorkerOpen,
    setJobWorkerOpen,
    openJobWorker,
    closeJobWorker,
    searchOpen,
    setSearchOpen,
    openSearch,
    closeSearch,
    bookCardOpen,
    setBookCardOpen,
    bookCardBookId,
    setBookCardBookId,
    openBookCard,
    closeBookCard,
    promptEditorOpen,
    setPromptEditorOpen,
    openPromptEditor,
    closePromptEditor,
    settingsOpen,
    setSettingsOpen,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber,
    editorTextVersion,
    setEditorTextVersion
  };
}
