import {
  selectChapterTextContext,
  useAppSelector
} from '@/state/appState';

export function useChapterTextContext() {
  const { displayedChapterText, firstChapterParagraph } = useAppSelector(selectChapterTextContext);

  return {
    displayedChapterText,
    firstChapterParagraph
  };
}
