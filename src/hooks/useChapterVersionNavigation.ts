import { useCallback } from 'react';
import {
  appActions,
  selectChapterVersionNavigationRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useChapterVersionNavigation() {
  const dispatch = useAppDispatch();
  const chapterVersionNavigationRequest = useAppSelector(selectChapterVersionNavigationRequest);

  const requestChapterVersionNavigation = useCallback(
    (chapterNumber: number, versionId: string) => {
      dispatch(appActions.requestChapterVersionNavigation(chapterNumber, versionId));
    },
    [dispatch]
  );

  const clearChapterVersionNavigation = useCallback(() => {
    dispatch(appActions.clearChapterVersionNavigation());
  }, [dispatch]);

  return {
    chapterVersionNavigationRequest,
    requestChapterVersionNavigation,
    clearChapterVersionNavigation
  };
}
