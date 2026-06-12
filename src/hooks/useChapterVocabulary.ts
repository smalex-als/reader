import { useCallback, useEffect, useMemo } from 'react';
import { loadChapterVocabulary } from '@/api/chapterStudyArtifacts';
import type { ChapterArtifactTarget } from '@/api/chapterStudyArtifacts';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';
import type { ChapterVocabulary } from '@/types/app';

type VocabularyPayloads = {
  loadVocabulary: {
    target: ChapterArtifactTarget | null;
    force: boolean;
  };
};

type VocabularyActions = {
  openModal: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setVocabulary: (vocabulary: ChapterVocabulary | null) => void;
};

const vocabularyHandlers = createActionHandlerRegistry<
  unknown,
  VocabularyActions,
  VocabularyPayloads
>();
const { addActionHandler } = vocabularyHandlers;

addActionHandler('loadVocabulary', async (_state, actions, payload): Promise<void> => {
  if (!payload.target) {
    actions.setError('Move to a page inside a known chapter to open vocabulary.');
    actions.setVocabulary(null);
    actions.setLoading(false);
    actions.openModal();
    return;
  }

  actions.openModal();
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load vocabulary.',
    request: () => loadChapterVocabulary(payload.target!, payload.force),
    onSuccess: actions.setVocabulary,
    onError: () => {
      actions.setVocabulary(null);
    }
  });
});

export function useChapterVocabulary() {
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
    async <T extends keyof VocabularyPayloads>(action: T, payload: VocabularyPayloads[T]) => {
      const actions: VocabularyActions = {
        openModal: () => dispatch(appActions.openModal('vocabulary')),
        setLoading: (loading) => dispatch(appActions.setVocabularyLoading(loading)),
        setError: (error) => dispatch(appActions.setVocabularyError(error)),
        setVocabulary: (vocabulary) => dispatch(appActions.setVocabulary(vocabulary))
      };
      await vocabularyHandlers.runAction(action, undefined, actions, payload);
    },
    [dispatch]
  );

  useEffect(() => {
    dispatch(appActions.resetVocabulary());
  }, [bookId, chapterNumber, dispatch]);

  const loadVocabulary = useCallback(async (force = false) => {
    await runAction('loadVocabulary', { target, force });
  }, [runAction, target]);

  const openVocabulary = useCallback(async () => {
    await loadVocabulary(false);
  }, [loadVocabulary]);

  const regenerateVocabulary = useCallback(async () => {
    await loadVocabulary(true);
  }, [loadVocabulary]);

  return {
    openVocabulary,
    regenerateVocabulary
  };
}
