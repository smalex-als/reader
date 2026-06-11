import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { clamp } from '@/lib/math';
import { saveLastPage } from '@/lib/storage';
import {
  appActions,
  selectPageNavigationRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { TocEntry } from '@/types/app';

interface UseNavigationParams {
  navigationCount: number;
  currentPage: number;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  isTextBook: boolean;
  currentChapterIndex: number | null;
  sortedTocEntries: TocEntry[];
  bookId: string | null;
  pendingAlignTopRef: MutableRefObject<boolean>;
  resetAudio: () => void;
  stopStream: () => void;
  currentImage: string | null;
  hasBooks: boolean;
  chapterNumber: number | null;
  currentChapterEntry: TocEntry | null;
}

export function useNavigation({
  navigationCount,
  currentPage,
  viewMode,
  isTextBook,
  currentChapterIndex,
  sortedTocEntries,
  bookId,
  pendingAlignTopRef,
  resetAudio,
  stopStream,
  currentImage,
  hasBooks,
  chapterNumber,
  currentChapterEntry
}: UseNavigationParams) {
  const dispatch = useAppDispatch();
  const pageNavigationRequest = useAppSelector(selectPageNavigationRequest);
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

  const footerMessage = useMemo(() => {
    if (viewMode === 'audio') {
      return '';
    }
    if (viewMode === 'text') {
      return '';
    }
    if (currentImage) {
      return currentImage;
    }
    if (hasBooks) {
      return 'Choose a book to begin reading.';
    }
    return 'No books found. Add files to /data to begin.';
  }, [chapterNumber, currentChapterEntry, currentImage, hasBooks, viewMode]);

  return { renderPage, handlePrev, handleNext, footerMessage };
}
