import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { useAudioController } from '@/hooks/useAudioController';
import { clamp } from '@/lib/math';
import { saveLastPage } from '@/lib/storage';
import {
  appActions,
  selectBookSessionWorkflow,
  selectPageNavigationRequest,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

interface UseNavigationParams {
  pendingAlignTopRef: MutableRefObject<boolean>;
  stopStream: () => void;
}

export function useNavigation({
  pendingAlignTopRef,
  stopStream
}: UseNavigationParams) {
  const dispatch = useAppDispatch();
  const { resetAudio } = useAudioController();
  const pageNavigationRequest = useAppSelector(selectPageNavigationRequest);
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const { bookType, chapterCount, manifest } = useAppSelector(selectBookSessionWorkflow);
  const { entries: tocEntries } = useAppSelector(selectTocWorkflow);
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const sortedTocEntries = useMemo(() => {
    return [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [tocEntries]);
  const currentChapterIndex = useMemo(() => {
    if (isTextBook) {
      return navigationCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [currentPage, isTextBook, navigationCount, sortedTocEntries]);
  const renderPage = useCallback(
    (pageIndex: number) => {
      if (navigationCount === 0) {
        return;
      }
      const maxIndex = navigationCount - 1;
      const nextIndex = clamp(pageIndex, 0, maxIndex);
      dispatch(appActions.setReaderCurrentPage(nextIndex));
      pendingAlignTopRef.current = viewMode === 'pages' || viewMode === 'scroll';
      dispatch(appActions.setRegeneratedPageText(false));
      if (bookId) {
        saveLastPage(bookId, nextIndex);
      }
      resetAudio();
      stopStream();
    },
    [
      bookId,
      dispatch,
      navigationCount,
      pendingAlignTopRef,
      resetAudio,
      stopStream,
      viewMode
    ]
  );

  const goToChapterIndex = useCallback(
    (index: number) => {
      const entry = sortedTocEntries[index];
      if (!entry) {
        return;
      }
      renderPage(entry.page);
    },
    [renderPage, sortedTocEntries]
  );

  const handlePrev = useCallback(() => {
    if (viewMode === 'text' || viewMode === 'audio') {
      if (isTextBook) {
        const existingPages = sortedTocEntries
          .map((entry) => entry.page)
          .filter((page) => Number.isInteger(page) && page >= 0 && page < navigationCount)
          .sort((a, b) => a - b);
        const previousExistingPage = [...existingPages].reverse().find((page) => page < currentPage);
        renderPage(previousExistingPage ?? currentPage - 1);
        return;
      }
      if (currentChapterIndex === null) {
        renderPage(currentPage - 1);
        return;
      }
      if (currentChapterIndex <= 0) {
        return;
      }
      goToChapterIndex(currentChapterIndex - 1);
      return;
    }
    renderPage(currentPage - 1);
  }, [
    currentChapterIndex,
    currentPage,
    goToChapterIndex,
    isTextBook,
    navigationCount,
    renderPage,
    sortedTocEntries,
    viewMode
  ]);

  const handleNext = useCallback(() => {
    if (viewMode === 'text' || viewMode === 'audio') {
      if (isTextBook) {
        const existingPages = sortedTocEntries
          .map((entry) => entry.page)
          .filter((page) => Number.isInteger(page) && page >= 0 && page < navigationCount)
          .sort((a, b) => a - b);
        const nextExistingPage = existingPages.find((page) => page > currentPage);
        renderPage(nextExistingPage ?? currentPage + 1);
        return;
      }
      if (currentChapterIndex === null) {
        renderPage(currentPage + 1);
        return;
      }
      if (currentChapterIndex >= sortedTocEntries.length - 1) {
        return;
      }
      goToChapterIndex(currentChapterIndex + 1);
      return;
    }
    renderPage(currentPage + 1);
  }, [
    currentChapterIndex,
    currentPage,
    goToChapterIndex,
    isTextBook,
    navigationCount,
    renderPage,
    sortedTocEntries,
    sortedTocEntries.length,
    viewMode
  ]);

  useEffect(() => {
    if (!pageNavigationRequest) {
      return;
    }
    if (pageNavigationRequest.kind === 'previous') {
      handlePrev();
    } else if (pageNavigationRequest.kind === 'next') {
      handleNext();
    } else {
      renderPage(pageNavigationRequest.pageIndex);
    }
    dispatch(appActions.clearPageNavigation());
  }, [dispatch, handleNext, handlePrev, pageNavigationRequest, renderPage]);

  return { renderPage, handlePrev, handleNext };
}
