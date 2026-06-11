import { useMemo } from 'react';
import {
  selectBookSessionWorkflow,
  selectReaderSession,
  selectTocWorkflow,
  useAppSelector
} from '@/state/appState';

export function useCurrentChapterLabel() {
  const { currentPage } = useAppSelector(selectReaderSession);
  const { bookType, chapterCount } = useAppSelector(selectBookSessionWorkflow);
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
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;

  return currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter');
}
