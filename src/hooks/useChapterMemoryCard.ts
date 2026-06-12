import { useCallback, useEffect, useMemo } from 'react';
import { loadChapterMemoryCard } from '@/api/chapterStudyArtifacts';
import type { ChapterArtifactTarget } from '@/api/chapterStudyArtifacts';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';
import type { ChapterMemoryCard } from '@/types/app';

type MemoryCardPayloads = {
  loadMemoryCard: {
    target: ChapterArtifactTarget | null;
    force: boolean;
  };
};

type MemoryCardActions = {
  openModal: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setMemoryCard: (memoryCard: ChapterMemoryCard | null) => void;
};

const memoryCardHandlers = createActionHandlerRegistry<
  unknown,
  MemoryCardActions,
  MemoryCardPayloads
>();
const { addActionHandler } = memoryCardHandlers;

addActionHandler('loadMemoryCard', async (_state, actions, payload): Promise<void> => {
  if (!payload.target) {
    actions.setError('Move to a page inside a known chapter to open a memory card.');
    actions.setMemoryCard(null);
    actions.setLoading(false);
    actions.openModal();
    return;
  }

  actions.openModal();
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load memory card.',
    request: () => loadChapterMemoryCard(payload.target!, payload.force),
    onSuccess: actions.setMemoryCard,
    onError: () => {
      actions.setMemoryCard(null);
    }
  });
});

export function useChapterMemoryCard() {
  const dispatch = useAppDispatch();
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();
  const target = useMemo(
    () =>
      bookId && chapterNumber
        ? {
            bookId,
            chapterNumber,
            pageRange: chapterRange
          }
        : null,
    [bookId, chapterNumber, chapterRange]
  );
  const runAction = useCallback(
    async <T extends keyof MemoryCardPayloads>(action: T, payload: MemoryCardPayloads[T]) => {
      const actions: MemoryCardActions = {
        openModal: () => dispatch(appActions.openModal('memoryCard')),
        setLoading: (loading) => dispatch(appActions.setMemoryCardLoading(loading)),
        setError: (error) => dispatch(appActions.setMemoryCardError(error)),
        setMemoryCard: (memoryCard) => dispatch(appActions.setMemoryCard(memoryCard))
      };
      await memoryCardHandlers.runAction(action, undefined, actions, payload);
    },
    [dispatch]
  );

  useEffect(() => {
    dispatch(appActions.resetMemoryCard());
  }, [bookId, chapterNumber, dispatch]);

  const loadMemoryCard = useCallback(async (force = false) => {
    await runAction('loadMemoryCard', { target, force });
  }, [runAction, target]);

  const openMemoryCard = useCallback(async () => {
    await loadMemoryCard(false);
  }, [loadMemoryCard]);

  const regenerateMemoryCard = useCallback(async () => {
    await loadMemoryCard(true);
  }, [loadMemoryCard]);

  return {
    openMemoryCard,
    regenerateMemoryCard
  };
}
