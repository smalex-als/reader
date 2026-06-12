import { useMemo } from 'react';
import { useQuiz } from '@/hooks/useQuiz';
import { selectNavigationState, useAppSelector } from '@/state/appState';

export function useUnitTopicQuiz() {
  const { selectedUnitSetId: unitSetId, selectedUnitTopicId: topicId } =
    useAppSelector(selectNavigationState);
  const target = useMemo(() => {
    if (!unitSetId || !topicId) {
      return null;
    }
    return {
      kind: 'unitTopic' as const,
      unitSetId,
      topicId
    };
  }, [unitSetId, topicId]);

  return useQuiz({
    targetKey: unitSetId && topicId ? `quiz::unit-${unitSetId}::topic-${topicId}` : null,
    target,
    modal: 'unitQuiz',
    unavailableMessage: 'Open a unit topic to create a quiz.'
  });
}
