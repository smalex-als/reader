import { useCallback } from 'react';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import {
  appActions,
  selectNavigationState,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { UnitSet } from '@/types/app';

export function useUnitsNavigationActions() {
  const dispatch = useAppDispatch();
  const { selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);
  const { openQuiz: openUnitTopicQuiz } = useUnitTopicQuiz();

  const selectSet = useCallback(
    (unitSetId: string | null) => {
      dispatch(appActions.setSelectedUnitSetId(unitSetId));
      dispatch(appActions.setSelectedUnitTopicId(null));
    },
    [dispatch]
  );

  const openSet = useCallback(
    (item: UnitSet) => {
      selectSet(item.id);
    },
    [selectSet]
  );

  const selectTopic = useCallback(
    (topicId: string | null) => {
      dispatch(appActions.setSelectedUnitTopicId(topicId));
    },
    [dispatch]
  );

  const openTopicQuiz = useCallback(
    async (label: string) => {
      dispatch(appActions.setUnitQuizLabel(label));
      await openUnitTopicQuiz();
      dispatch(appActions.refreshUnits());
    },
    [dispatch, openUnitTopicQuiz]
  );

  const openSource = useCallback(
    (bookId: string, chapterNumber: number) => {
      dispatch(appActions.requestUnitSourceNavigation(bookId, chapterNumber));
    },
    [dispatch]
  );

  return {
    selectedSetId: selectedUnitSetId,
    selectedTopicId: selectedUnitTopicId,
    selectSet,
    openSet,
    selectTopic,
    openTopicQuiz,
    openSource
  };
}
