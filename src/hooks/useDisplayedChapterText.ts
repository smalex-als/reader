import { useEffect } from 'react';
import { hashText } from '@/lib/textHash';
import { appActions, useAppDispatch } from '@/state/appState';

export function useDisplayedChapterText({
  chapterNumber,
  chapterTitle,
  displayText,
  selectedVersionId,
  selectedVersionLabel,
  enabled = true
}: {
  chapterNumber: number | null;
  chapterTitle: string | null;
  displayText: string;
  selectedVersionId: string;
  selectedVersionLabel: string | null;
  enabled?: boolean;
}) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!enabled) return;
    if (!displayText || !chapterNumber) {
      dispatch(appActions.setFirstChapterParagraph(null));
      return;
    }
    const paragraphs = displayText
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      dispatch(appActions.setFirstChapterParagraph(null));
      return;
    }
    const firstParagraph = paragraphs[0];
    const startIndex = displayText.indexOf(firstParagraph);
    dispatch(appActions.setFirstChapterParagraph({
      fullText: displayText,
      startIndex: Math.max(0, startIndex),
      key: `chapter-${chapterNumber}-${selectedVersionId}-${hashText(firstParagraph)}-${startIndex}`
    }));
  }, [chapterNumber, dispatch, displayText, enabled, selectedVersionId]);

  useEffect(() => {
    if (!enabled) return;
    if (!displayText || !chapterNumber) {
      dispatch(appActions.setDisplayedChapterText(null));
      return;
    }
    dispatch(appActions.setDisplayedChapterText({
      text: displayText,
      chapterTitle,
      versionLabel: selectedVersionLabel,
      versionId: selectedVersionId
    }));
  }, [chapterNumber, chapterTitle, dispatch, displayText, enabled, selectedVersionId, selectedVersionLabel]);
}
