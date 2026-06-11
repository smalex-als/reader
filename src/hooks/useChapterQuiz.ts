import { useCallback } from 'react';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useQuiz } from '@/hooks/useQuiz';

export function useChapterQuiz() {
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();

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
