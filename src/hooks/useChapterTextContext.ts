import { useCallback } from 'react';
import {
  appActions,
  selectChapterTextContext,
  useAppDispatch,
  useAppSelector,
  type ChapterParagraph,
  type DisplayedChapterText
} from '@/state/appState';

export function useChapterTextContext() {
  const dispatch = useAppDispatch();
  const { displayedChapterText, firstChapterParagraph } = useAppSelector(selectChapterTextContext);

  const setDisplayedChapterText = useCallback(
    (payload: DisplayedChapterText | null) => {
      dispatch(appActions.setDisplayedChapterText(payload));
    },
    [dispatch]
  );

  const setFirstChapterParagraph = useCallback(
    (payload: ChapterParagraph | null) => {
      dispatch(appActions.setFirstChapterParagraph(payload));
    },
    [dispatch]
  );

  return {
    displayedChapterText,
    setDisplayedChapterText,
    firstChapterParagraph,
    setFirstChapterParagraph
  };
}
