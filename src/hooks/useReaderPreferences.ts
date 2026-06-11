import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectReaderPreferences,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadQuizAutoplayForBook,
  saveQuizAutoplayForBook
} from '@/lib/storage';
import type { PageTextOcrEngine } from '@/types/app';

export function useReaderPreferences(bookId: string | null) {
  const dispatch = useAppDispatch();
  const { pageTextOcrEngine, quizAutoPlayEnabled } = useAppSelector(selectReaderPreferences);

  useEffect(() => {
    if (!bookId) {
      dispatch(appActions.setQuizAutoPlayEnabled(true));
      return;
    }
    dispatch(appActions.setQuizAutoPlayEnabled(loadQuizAutoplayForBook(bookId) ?? true));
  }, [bookId, dispatch]);

  useEffect(() => {
    if (!bookId) {
      return;
    }
    saveQuizAutoplayForBook(bookId, quizAutoPlayEnabled);
  }, [bookId, quizAutoPlayEnabled]);

  const setPageTextOcrEngine = useCallback(
    (engine: PageTextOcrEngine) => {
      dispatch(appActions.setPageTextOcrEngine(engine));
    },
    [dispatch]
  );

  const setQuizAutoPlayEnabled = useCallback(
    (enabled: boolean) => {
      dispatch(appActions.setQuizAutoPlayEnabled(enabled));
    },
    [dispatch]
  );

  return {
    pageTextOcrEngine,
    setPageTextOcrEngine,
    quizAutoPlayEnabled,
    setQuizAutoPlayEnabled
  };
}
