import { useCallback, useEffect, useRef } from 'react';
import {
  appActions,
  selectTextVersionModalWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useChapterTextVersionModalRuntime({
  selectedVersionId,
  versionSaving,
  handleCreateVersion
}: {
  selectedVersionId: string;
  versionSaving: boolean;
  handleCreateVersion: () => Promise<boolean | void>;
}) {
  const dispatch = useAppDispatch();
  const {
    open: versionModalOpen,
    createRequestId
  } = useAppSelector(selectTextVersionModalWorkflow);
  const handledCreateRequestRef = useRef(0);

  const closeVersionModal = useCallback(() => {
    if (versionSaving) {
      return;
    }
    dispatch(appActions.closeTextVersionModal());
  }, [dispatch, versionSaving]);

  const openVersionModal = useCallback(() => {
    dispatch(appActions.openTextVersionModal(selectedVersionId || 'base'));
  }, [dispatch, selectedVersionId]);

  useEffect(() => {
    if (createRequestId === 0 || handledCreateRequestRef.current === createRequestId) {
      return;
    }
    handledCreateRequestRef.current = createRequestId;
    void handleCreateVersion().then((created) => {
      if (created) {
        dispatch(appActions.closeTextVersionModal());
      }
    });
  }, [createRequestId, dispatch, handleCreateVersion]);

  return {
    versionModalOpen,
    openVersionModal,
    closeVersionModal
  };
}
