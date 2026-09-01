import { useEffect, useMemo, useState } from 'react';
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
  selectTocWorkflow,
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
  const { entries: tocEntries } = useAppSelector(selectTocWorkflow);
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
  const chapterNavigation = useMemo(() => {
    const sortedEntries = [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((left, right) => left.page - right.page);

    if (sortedEntries.length === 0) {
      const total = isTextBook ? chapterCount : 0;
      const position = total > 0 ? Math.min(total, currentPage + 1) : 0;
      return {
        hasPrevious: position > 1,
        hasNext: position > 0 && position < total,
        previousLabel: position > 1 ? `Chapter ${position - 1}` : null,
        nextLabel: position > 0 && position < total ? `Chapter ${position + 1}` : null,
        position,
        total
      };
    }

    const nextEntryIndex = sortedEntries.findIndex((entry) => entry.page > currentPage);
    const currentIndex = nextEntryIndex === -1
      ? sortedEntries.length - 1
      : Math.max(0, nextEntryIndex - 1);
    const previousEntry = sortedEntries[currentIndex - 1] ?? null;
    const nextEntry = sortedEntries[currentIndex + 1] ?? null;
    const entryLabel = (entry: (typeof sortedEntries)[number] | null, index: number) =>
      entry?.title?.trim() || (entry ? `Chapter ${index + 1}` : null);

    return {
      hasPrevious: Boolean(previousEntry),
      hasNext: Boolean(nextEntry),
      previousLabel: entryLabel(previousEntry, currentIndex - 1),
      nextLabel: entryLabel(nextEntry, currentIndex + 1),
      position: currentIndex + 1,
      total: sortedEntries.length
    };
  }, [chapterCount, currentPage, isTextBook, tocEntries]);
  const isChapterNavigation = viewMode === 'text';
  const progressPosition = isChapterNavigation ? chapterNavigation.position : displayPage;
  const progressCount = isChapterNavigation ? chapterNavigation.total : navigationCount;
  const progress = progressCount === 0
    ? 0
    : Math.min(100, (progressPosition / progressCount) * 100);

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
    chapterNavigation,
    closePanel,
    controlsDisabled,
    displayPage,
    handleShowBookmarks,
    handleToggleBookmark,
    isBookmarked,
    isChapterNavigation,
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
