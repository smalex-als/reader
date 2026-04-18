import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterQuiz } from '@/types/app';

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
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<ChapterQuiz | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    setQuiz(null);
    setQuizError(null);
    setQuizLoading(false);
  }, [bookId, chapterNumber]);

  const loadQuiz = useCallback(async (force = false) => {
    if (!bookId || !chapterNumber) {
      setQuizError('Move to a page inside a known chapter to open a quiz.');
      setQuiz(null);
      setQuizOpen(true);
      return;
    }

    setQuizOpen(true);
    setQuizLoading(true);
    setQuizError(null);
    setQuiz(null);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const baseUrl = `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/quiz`;
      let response = await fetch(baseUrl);
      if (response.status === 404 || force) {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            force,
            ...(chapterRange
              ? {
                  pageStart: chapterRange.start,
                  pageEnd: chapterRange.end
                }
              : {})
          })
        });
      }
      if (!response.ok) {
        throw new Error(`Quiz request failed: ${response.status}`);
      }

      const payload = (await response.json()) as {
        title: string;
        questions: ChapterQuiz['questions'];
        source: ChapterQuiz['source'];
        chapterNumber: number;
        file?: string;
      };

      if (requestIdRef.current !== requestId) {
        return;
      }
      setQuiz({
        chapterNumber: payload.chapterNumber,
        title: payload.title,
        questions: Array.isArray(payload.questions) ? payload.questions : [],
        source: payload.source,
        file: payload.file
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load quiz.';
      setQuizError(message);
      setQuiz(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setQuizLoading(false);
      }
    }
  }, [bookId, chapterNumber, chapterRange]);

  const openQuiz = useCallback(async () => {
    await loadQuiz(false);
  }, [loadQuiz]);

  const regenerateQuiz = useCallback(async () => {
    await loadQuiz(true);
  }, [loadQuiz]);

  const closeQuiz = useCallback(() => {
    setQuizOpen(false);
  }, []);

  return {
    quizOpen,
    quizLoading,
    quizError,
    quiz,
    openQuiz,
    regenerateQuiz,
    closeQuiz
  };
}
