import { useMemo } from 'react';
import {
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectReaderSession,
  selectTocWorkflow,
  useAppSelector
} from '@/state/appState';

export function useCurrentChapterContext() {
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const { entries: tocEntries } = useAppSelector(selectTocWorkflow);
  const sortedTocEntries = useMemo(
    () =>
      [...tocEntries]
        .filter((entry) => Number.isInteger(entry.page))
        .sort((left, right) => left.page - right.page),
    [tocEntries]
  );
  const currentChapterIndex = useMemo(() => {
    if (bookType === 'text') {
      return chapterCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [bookType, chapterCount, currentPage, sortedTocEntries]);
  const currentChapterEntry = useMemo(() => {
    if (bookType === 'text') {
      return sortedTocEntries.find((entry) => entry.page === currentPage) ?? null;
    }
    return currentChapterIndex !== null ? sortedTocEntries[currentChapterIndex] : null;
  }, [bookType, currentChapterIndex, currentPage, sortedTocEntries]);
  const nextChapterEntry =
    bookType !== 'text' && currentChapterIndex !== null
      ? sortedTocEntries[currentChapterIndex + 1]
      : null;
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
  const pageRange =
    bookType !== 'text' && currentChapterEntry
      ? { start: currentChapterEntry.page, end: nextChapterEntry?.page ?? manifest.length }
      : null;
  const chapterTitle = currentChapterEntry?.title ?? null;
  const chapterLabel = chapterTitle ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter');

  return {
    bookId,
    chapterNumber,
    chapterTitle,
    chapterLabel,
    pageRange
  };
}

export function useCurrentChapterLabel() {
  return useCurrentChapterContext().chapterLabel;
}
