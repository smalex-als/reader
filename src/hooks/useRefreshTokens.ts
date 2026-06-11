import { useCallback } from 'react';
import {
  appActions,
  selectRefreshTokens,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useRefreshTokens() {
  const dispatch = useAppDispatch();
  const refreshTokens = useAppSelector(selectRefreshTokens);

  const refreshChapterView = useCallback(() => {
    dispatch(appActions.refreshChapterView());
  }, [dispatch]);

  const refreshBookCards = useCallback(() => {
    dispatch(appActions.refreshBookCards());
  }, [dispatch]);

  return {
    chapterViewRefresh: refreshTokens.chapterView,
    bookCardRefreshToken: refreshTokens.bookCards,
    refreshChapterView,
    refreshBookCards
  };
}
