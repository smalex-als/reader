import { useCallback, useState } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import {
  appActions,
  selectUnitWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { UnitSet } from '@/types/app';

interface UseUnitActionsOptions {
  bookId: string | null;
  chapterNumber: number | null;
  currentChapterTitle: string | null;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useUnitActions({
  bookId,
  chapterNumber,
  currentChapterTitle,
  showToast
}: UseUnitActionsOptions) {
  const dispatch = useAppDispatch();
  const { refreshToken: unitsRefreshToken, quizLabel: unitQuizLabel } = useAppSelector(selectUnitWorkflow);
  const [unitCreating, setUnitCreating] = useState(false);

  const refreshUnits = useCallback(() => {
    dispatch(appActions.refreshUnits());
  }, [dispatch]);

  const setUnitQuizLabel = useCallback(
    (label: string) => {
      dispatch(appActions.setUnitQuizLabel(label));
    },
    [dispatch]
  );

  const handleOpenUnits = useCallback(() => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setSelectedUnitSetId(null));
    dispatch(appActions.setSelectedUnitTopicId(null));
    dispatch(appActions.setMainView('units'));
  }, [dispatch]);

  const handleCreateUnit = useCallback(
    async (payload: {
      text: string;
      chapterTitle: string | null;
      versionLabel: string | null;
      versionId: string | null;
    }) => {
      if (!bookId || !chapterNumber) {
        showToast('Select a chapter before creating units', 'error');
        return;
      }
      const content = payload.text.trim();
      if (!content) {
        showToast('No visible chapter text available for units', 'error');
        return;
      }
      setUnitCreating(true);
      try {
        const result = await fetchJson<{ item: UnitSet }>('/api/units', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sourceBookId: bookId,
            sourceChapterNumber: chapterNumber,
            sourceChapterTitle: payload.chapterTitle ?? currentChapterTitle ?? null,
            sourceVersionId: payload.versionId ?? payload.versionLabel ?? null,
            content
          })
        });
        dispatch(appActions.refreshUnits());
        dispatch(appActions.setSelectedUnitSetId(result.item.id));
        dispatch(appActions.setSelectedUnitTopicId(null));
        dispatch(appActions.closeModal('settings'));
        dispatch(appActions.setMainView('units'));
        showToast('Unit created', 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to create unit', 'error');
      } finally {
        setUnitCreating(false);
      }
    },
    [
      bookId,
      chapterNumber,
      currentChapterTitle,
      dispatch,
      showToast
    ]
  );

  return {
    unitsRefreshToken,
    refreshUnits,
    unitCreating,
    unitQuizLabel,
    setUnitQuizLabel,
    handleOpenUnits,
    handleCreateUnit
  };
}
