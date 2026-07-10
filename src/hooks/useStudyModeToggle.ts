import { useCallback } from 'react';
import {
  appActions,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useStreamRuntimeSelector } from '@/state/streamRuntimeStore';

function isActiveStreamStatus(status: string) {
  return status === 'connecting' || status === 'streaming' || status === 'paused';
}

export function useStudyModeToggle() {
  const dispatch = useAppDispatch();
  const streamStatus = useStreamRuntimeSelector((state) => state.status);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { studyMode } = settings;

  const toggleStudyMode = useCallback(() => {
    const nextStudyMode = !studyMode;
    dispatch(appActions.setViewerSettings({
      ...settings,
      studyMode: nextStudyMode
    }));
    if (nextStudyMode && isActiveStreamStatus(streamStatus)) {
      dispatch(appActions.requestStopAfterCurrentStream());
    }
  }, [dispatch, settings, streamStatus, studyMode]);

  return {
    studyMode,
    toggleStudyMode
  };
}
