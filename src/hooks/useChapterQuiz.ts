import { useCallback } from 'react';
import { useQuiz } from '@/hooks/useQuiz';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type UseChapterQuizOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
};

export function useChapterQuiz({ bookId, chapterNumber, chapterRange }: UseChapterQuizOptions) {
  const buildUrl = useCallback(() => {
    if (!bookId || !chapterNumber) {
      return null;
    }
    return `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/quiz`;
  }, [bookId, chapterNumber]);

  const buildPostBody = useCallback(
    (force: boolean) => ({
      force,
      ...(chapterRange
        ? {
            pageStart: chapterRange.start,
            pageEnd: chapterRange.end
          }
        : {})
    }),
    [chapterRange]
  );

  return useQuiz({
    targetKey: bookId && chapterNumber ? `quiz::chapter-${chapterNumber}` : null,
    modal: 'chapterQuiz',
    unavailableMessage: 'Move to a page inside a known chapter to open a quiz.',
    buildUrl,
    buildPostBody
  });
}
