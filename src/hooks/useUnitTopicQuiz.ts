import { useCallback } from 'react';
import { useQuiz } from '@/hooks/useQuiz';

type UseUnitTopicQuizOptions = {
  unitSetId: string | null;
  topicId: string | null;
};

export function useUnitTopicQuiz({ unitSetId, topicId }: UseUnitTopicQuizOptions) {
  const buildUrl = useCallback(() => {
    if (!unitSetId || !topicId) {
      return null;
    }
    return `/api/units/${encodeURIComponent(unitSetId)}/topics/${encodeURIComponent(topicId)}/quiz`;
  }, [unitSetId, topicId]);

  return useQuiz({
    targetKey: unitSetId && topicId ? `quiz::unit-${unitSetId}::topic-${topicId}` : null,
    unavailableMessage: 'Open a unit topic to create a quiz.',
    buildUrl
  });
}
