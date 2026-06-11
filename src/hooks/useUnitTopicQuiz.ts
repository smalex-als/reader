import { useCallback } from 'react';
import { useQuiz } from '@/hooks/useQuiz';
import { selectNavigationState, useAppSelector } from '@/state/appState';

export function useUnitTopicQuiz() {
  const { selectedUnitSetId: unitSetId, selectedUnitTopicId: topicId } =
    useAppSelector(selectNavigationState);
  const buildUrl = useCallback(() => {
    if (!unitSetId || !topicId) {
      return null;
    }
    return `/api/units/${encodeURIComponent(unitSetId)}/topics/${encodeURIComponent(topicId)}/quiz`;
  }, [unitSetId, topicId]);

  return useQuiz({
    targetKey: unitSetId && topicId ? `quiz::unit-${unitSetId}::topic-${topicId}` : null,
    modal: 'unitQuiz',
    unavailableMessage: 'Open a unit topic to create a quiz.',
    buildUrl
  });
}
