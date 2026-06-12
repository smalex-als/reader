import { useCallback } from 'react';
import {
  appActions,
  selectStreamRuntime,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function isActiveStreamStatus(status: string) {
  return status === 'connecting' || status === 'streaming' || status === 'paused';
}

export function useStudyModeToggle() {
  const dispatch = useAppDispatch();
  const streamState = useAppSelector(selectStreamRuntime);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { studyMode } = settings;

  const toggleStudyMode = useCallback(() => {
    const nextStudyMode = !studyMode;
    dispatch(appActions.setViewerSettings({
      ...settings,
      studyMode: nextStudyMode
    }));
    if (nextStudyMode && isActiveStreamStatus(streamState.status)) {
      dispatch(appActions.requestStopAfterCurrentStream());
    }
  }, [dispatch, settings, streamState.status, studyMode]);

  return {
    studyMode,
    toggleStudyMode
  };
}
