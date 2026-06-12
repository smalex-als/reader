import { useMemo } from 'react';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useQuiz } from '@/hooks/useQuiz';

export function useChapterQuiz() {
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();
  const target = useMemo(() => {
    if (!bookId || !chapterNumber) {
      return null;
    }
    return {
      kind: 'chapter' as const,
      bookId,
      chapterNumber,
      pageRange: chapterRange
    };
  }, [bookId, chapterNumber, chapterRange]);

  return useQuiz({
    targetKey: bookId && chapterNumber ? `quiz::chapter-${chapterNumber}` : null,
    target,
    modal: 'chapterQuiz',
    unavailableMessage: 'Move to a page inside a known chapter to open a quiz.'
  });
}
