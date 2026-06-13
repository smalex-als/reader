import { useCallback, useMemo } from 'react';
import {
  appActions,
  selectStreamRuntime,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useUnitTopicPlayback({
  unitSetId,
  topicId,
  topicText,
  topicSpeechText
}: {
  unitSetId: string;
  topicId: string;
  topicText: string;
  topicSpeechText: string;
}) {
  const dispatch = useAppDispatch();
  const streamState = useAppSelector(selectStreamRuntime);
  const unitStreamBaseKey = useMemo(
    () => `unit::${encodeURIComponent(unitSetId)}::${encodeURIComponent(topicId)}`,
    [topicId, unitSetId]
  );
  const unitParagraphPrefix = `${unitStreamBaseKey}::paragraph-start-`;
  const topicStreamActive =
    typeof streamState.pageKey === 'string' &&
    streamState.pageKey.startsWith(unitParagraphPrefix) &&
    (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused');
  const activeParagraphStart = useMemo(() => {
    if (!topicStreamActive || typeof streamState.pageKey !== 'string') {
      return null;
    }
    if (!streamState.pageKey.startsWith(unitParagraphPrefix)) {
      return null;
    }
    return Number.parseInt(streamState.pageKey.slice(unitParagraphPrefix.length), 10);
  }, [streamState.pageKey, topicStreamActive, unitParagraphPrefix]);

  const playTextBlock = useCallback(
    (startIndex: number) => {
      dispatch(appActions.requestPlayStudyAudioParagraph({
        fullText: topicText,
        startIndex,
        key: unitStreamBaseKey
      }));
    },
    [dispatch, topicText, unitStreamBaseKey]
  );

  const toggleTopicSpeech = useCallback(() => {
    if (topicStreamActive) {
      dispatch(appActions.requestStopStream());
      return;
    }
    dispatch(appActions.requestPlayStudyAudioParagraph({
      fullText: topicSpeechText,
      startIndex: 0,
      key: unitStreamBaseKey
    }));
  }, [dispatch, topicSpeechText, topicStreamActive, unitStreamBaseKey]);

  return {
    activeParagraphStart,
    topicStreamActive,
    playTextBlock,
    toggleTopicSpeech
  };
}
