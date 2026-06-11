import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectMemoryCardWorkflow,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ChapterMemoryCard } from '@/types/app';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type UseChapterMemoryCardOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
};

export function useChapterMemoryCard({ bookId, chapterNumber, chapterRange }: UseChapterMemoryCardOptions) {
  const dispatch = useAppDispatch();
  const memoryCardOpen = useAppSelector(selectModalOpen('memoryCard'));
  const {
    loading: memoryCardLoading,
    error: memoryCardError,
    memoryCard
  } = useAppSelector(selectMemoryCardWorkflow);

  useEffect(() => {
    dispatch(appActions.resetMemoryCard());
  }, [bookId, chapterNumber, dispatch]);

  const loadMemoryCard = useCallback(async (force = false) => {
    if (!bookId || !chapterNumber) {
      dispatch(appActions.setMemoryCardError('Move to a page inside a known chapter to open a memory card.'));
      dispatch(appActions.setMemoryCard(null));
      dispatch(appActions.openModal('memoryCard'));
      return;
    }

    dispatch(appActions.openModal('memoryCard'));
    dispatch(appActions.setMemoryCardLoading(true));
    dispatch(appActions.setMemoryCardError(null));

    try {
      const baseUrl = `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/memory-card`;
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
        throw new Error(`Memory card request failed: ${response.status}`);
      }

      const payload = (await response.json()) as {
        title: string;
        text: string;
        source: ChapterMemoryCard['source'];
        chapterNumber: number;
        file?: string;
      };

      dispatch(appActions.setMemoryCard({
        chapterNumber: payload.chapterNumber,
        title: payload.title,
        text: payload.text,
        source: payload.source,
        file: payload.file
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load memory card.';
      dispatch(appActions.setMemoryCardError(message));
      dispatch(appActions.setMemoryCard(null));
    } finally {
      dispatch(appActions.setMemoryCardLoading(false));
    }
  }, [bookId, chapterNumber, chapterRange, dispatch]);

  const openMemoryCard = useCallback(async () => {
    await loadMemoryCard(false);
  }, [loadMemoryCard]);

  const regenerateMemoryCard = useCallback(async () => {
    await loadMemoryCard(true);
  }, [loadMemoryCard]);

  const closeMemoryCard = useCallback(() => {
    dispatch(appActions.closeModal('memoryCard'));
  }, [dispatch]);

  return {
    memoryCardOpen,
    memoryCardLoading,
    memoryCardError,
    memoryCard,
    openMemoryCard,
    regenerateMemoryCard,
    closeMemoryCard
  };
}
