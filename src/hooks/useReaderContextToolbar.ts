import { useEffect, useState } from 'react';
import { useShowBookmarks, useToggleBookmark } from '@/hooks/useBookmarks';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import type { ViewMode } from '@/lib/appConstants';
import {
  appActions,
  selectBookmarkWorkflow,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectReaderSession,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useStreamRuntimeSelector } from '@/state/streamRuntimeStore';

export type ReaderContextPanel = 'listen' | 'mode' | 'more' | null;

export function useReaderContextToolbar() {
  const dispatch = useAppDispatch();
  const showBookmarks = useShowBookmarks();
  const toggleBookmark = useToggleBookmark();
  const { chapterLabel, chapterNumber } = useCurrentChapterContext();
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const { items: bookmarks } = useAppSelector(selectBookmarkWorkflow);
  const { streamVoice, streamVoiceOptions } = useAppSelector(selectVoiceWorkflow);
  const streamStatus = useStreamRuntimeSelector((state) => state.status);
  const [activePanel, setActivePanel] = useState<ReaderContextPanel>(null);
  const [pageDraft, setPageDraft] = useState('');
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const controlsDisabled = navigationCount === 0 || !bookId;
  const isBookmarked = bookmarks.some((entry) => entry.page === currentPage);
  const streamActive =
    streamStatus === 'streaming' ||
    streamStatus === 'connecting' ||
    streamStatus === 'paused';
  const displayPage = navigationCount === 0 ? 0 : currentPage + 1;
  const progress = navigationCount === 0 ? 0 : Math.min(100, (displayPage / navigationCount) * 100);

  useEffect(() => {
    setPageDraft('');
  }, [currentPage, navigationCount]);

  const setPanel = (panel: Exclude<ReaderContextPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };
  const closePanel = () => setActivePanel(null);
  const setViewMode = (mode: ViewMode) => {
    if (isTextBook && (mode === 'pages' || mode === 'scroll')) {
      return;
    }
    dispatch(appActions.setReaderViewMode(mode));
    closePanel();
  };
  const submitPage = () => {
    const desired = Number.parseInt(pageDraft, 10);
    if (!Number.isInteger(desired)) {
      return;
    }
    dispatch(appActions.requestPageNavigation(desired - 1));
    setPageDraft('');
  };
  const openBookSelect = () => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.openModal('bookSelect'));
    closePanel();
  };
  const openAudioLibrary = () => {
    dispatch(appActions.setMainView('audio-library'));
    closePanel();
  };
  const openUnits = () => {
    dispatch(appActions.setSelectedUnitSetId(null));
    dispatch(appActions.setSelectedUnitTopicId(null));
    dispatch(appActions.setMainView('units'));
    closePanel();
  };
  const openSettings = () => {
    dispatch(appActions.openModal('settings'));
    closePanel();
  };
  const openToc = () => {
    dispatch(appActions.openModal('tocNav'));
    closePanel();
  };
  const openSearch = () => {
    dispatch(appActions.openModal('search'));
    closePanel();
  };
  const openListeningDashboard = () => {
    dispatch(appActions.openModal('listeningDashboard'));
    closePanel();
  };
  const handleShowBookmarks = () => {
    showBookmarks();
    closePanel();
  };
  const handleToggleBookmark = () => {
    toggleBookmark();
    closePanel();
  };
  const toggleStream = () => {
    dispatch(streamActive ? appActions.requestStopStream() : appActions.requestPlayVisibleStream());
  };

  return {
    activePanel,
    bookId,
    chapterLabel: chapterNumber ? chapterLabel : null,
    closePanel,
    controlsDisabled,
    displayPage,
    handleShowBookmarks,
    handleToggleBookmark,
    isBookmarked,
    isTextBook,
    navigationCount,
    openAudioLibrary,
    openBookSelect,
    openListeningDashboard,
    openSearch,
    openSettings,
    openToc,
    openUnits,
    pageDraft,
    progress,
    requestNextPage: () => dispatch(appActions.requestNextPageNavigation()),
    requestPreviousPage: () => dispatch(appActions.requestPreviousPageNavigation()),
    setPageDraft,
    setPanel,
    setStreamVoice: (voice: string) => dispatch(appActions.requestStreamVoiceChange(voice)),
    setViewMode,
    streamActive,
    streamVoice,
    streamVoiceOptions,
    submitPage,
    toggleStream,
    viewMode
  };
}
