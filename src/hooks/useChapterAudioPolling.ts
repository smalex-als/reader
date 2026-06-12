import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  chapterTextVersionHandlers,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';

export function useChapterAudioPolling({
  bookId,
  chapterNumber,
  actionsRef,
  resetAudioJob
}: {
  bookId: string | null;
  chapterNumber: number | null;
  actionsRef: RefObject<ChapterTextVersionActions | null>;
  resetAudioJob: () => void;
}) {
  const audioPollTimers = useRef<Map<number, number>>(new Map());
  const audioPollAttempts = useRef<Map<number, number>>(new Map());
  const audioPollRef = useRef<(chapterNumber: number) => void>();

  const clearAudioPoll = useCallback(() => {
    audioPollTimers.current.forEach((timer) => window.clearTimeout(timer));
    audioPollTimers.current.clear();
    audioPollAttempts.current.clear();
  }, []);

  const scheduleAudioPoll = useCallback((currentChapter: number) => {
    const attempt = (audioPollAttempts.current.get(currentChapter) ?? 0) + 1;
    audioPollAttempts.current.set(currentChapter, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      audioPollRef.current?.(currentChapter);
    }, delay);
    audioPollTimers.current.set(currentChapter, timer);
  }, []);

  const pollAudioJobStatus = useCallback(
    async (currentChapter: number) => {
      if (!bookId || !currentChapter) {
        return;
      }
      const actions = actionsRef.current;
      if (!actions) {
        return;
      }
      await chapterTextVersionHandlers.runAction('pollAudioJobStatus', null, actions, {
        bookId,
        chapterNumber: currentChapter
      });
    },
    [actionsRef, bookId]
  );

  useEffect(() => {
    audioPollRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  useEffect(() => {
    resetAudioJob();
    clearAudioPoll();
  }, [bookId, chapterNumber, clearAudioPoll, resetAudioJob]);

  return {
    clearAudioPoll,
    scheduleAudioPoll
  };
}
