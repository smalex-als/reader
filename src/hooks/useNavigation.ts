import type { MutableRefObject } from 'react';
import { useCallback, useMemo } from 'react';
import { clamp } from '@/lib/math';
import { saveLastPage } from '@/lib/storage';
import type { TocEntry } from '@/types/app';

interface UseNavigationParams {
  navigationCount: number;
  currentPage: number;
  viewMode: 'pages' | 'text';
  isTextBook: boolean;
  currentChapterIndex: number | null;
  sortedTocEntries: TocEntry[];
  bookId: string | null;
  setCurrentPage: (value: number) => void;
  setRegeneratedText: (value: boolean) => void;
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
  setCurrentPage,
  setRegeneratedText,
  pendingAlignTopRef,
  resetAudio,
  stopStream,
  currentImage,
  hasBooks,
  chapterNumber,
  currentChapterEntry
}: UseNavigationParams) {
  const renderPage = useCallback(
    (pageIndex: number) => {
      if (navigationCount === 0) {
        return;
      }
      const maxIndex = navigationCount - 1;
      const nextIndex = clamp(pageIndex, 0, maxIndex);
      setCurrentPage(nextIndex);
      pendingAlignTopRef.current = viewMode === 'pages';
      setRegeneratedText(false);
      if (bookId) {
        saveLastPage(bookId, nextIndex);
      }
      resetAudio();
      stopStream();
    },
    [
      bookId,
      navigationCount,
      pendingAlignTopRef,
      resetAudio,
      setCurrentPage,
      setRegeneratedText,
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
    if (viewMode === 'text') {
      if (isTextBook) {
        renderPage(currentPage - 1);
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
  }, [currentChapterIndex, currentPage, goToChapterIndex, isTextBook, renderPage, viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === 'text') {
      if (isTextBook) {
        renderPage(currentPage + 1);
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
    renderPage,
    sortedTocEntries.length,
    viewMode
  ]);

  const footerMessage = useMemo(() => {
    if (viewMode === 'text') {
      if (chapterNumber && currentChapterEntry) {
        return `Chapter ${chapterNumber}: ${currentChapterEntry.title}`;
      }
      if (hasBooks) {
        return 'Open the TOC to create chapters for text view.';
      }
      return 'No books found. Add files to /data to begin.';
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
