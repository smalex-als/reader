import { useCallback, useEffect } from 'react';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';
import type { ChapterVocabulary } from '@/types/app';

export function useChapterVocabulary() {
  const dispatch = useAppDispatch();
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();

  useEffect(() => {
    dispatch(appActions.resetVocabulary());
  }, [bookId, chapterNumber, dispatch]);

  const loadVocabulary = useCallback(async (force = false) => {
    if (!bookId || !chapterNumber) {
      dispatch(appActions.setVocabularyError('Move to a page inside a known chapter to open vocabulary.'));
      dispatch(appActions.setVocabulary(null));
      dispatch(appActions.openModal('vocabulary'));
      return;
    }

    dispatch(appActions.openModal('vocabulary'));
    dispatch(appActions.setVocabularyLoading(true));
    dispatch(appActions.setVocabularyError(null));

    try {
      const baseUrl = `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/vocabulary`;
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
        throw new Error(`Vocabulary request failed: ${response.status}`);
      }

      const payload = (await response.json()) as {
        title: string;
        items: ChapterVocabulary['items'];
        source: ChapterVocabulary['source'];
        chapterNumber: number;
        file?: string;
      };

      dispatch(appActions.setVocabulary({
        chapterNumber: payload.chapterNumber,
        title: payload.title,
        items: Array.isArray(payload.items) ? payload.items : [],
        source: payload.source,
        file: payload.file
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load vocabulary.';
      dispatch(appActions.setVocabularyError(message));
      dispatch(appActions.setVocabulary(null));
    } finally {
      dispatch(appActions.setVocabularyLoading(false));
    }
  }, [bookId, chapterNumber, chapterRange, dispatch]);

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
