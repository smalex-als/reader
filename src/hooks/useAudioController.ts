import { useCallback } from 'react';
import {
  appActions,
  selectAudioState,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useAudioController() {
  const dispatch = useAppDispatch();
  const audioState = useAppSelector(selectAudioState);

  const resetAudio = useCallback(() => {
    dispatch(appActions.resetAudio());
  }, [dispatch]);

  const stopAudio = useCallback(() => {
    dispatch(appActions.stopAudio());
  }, [dispatch]);

  const resetAudioCache = useCallback(() => {
    resetAudio();
  }, [resetAudio]);

  return {
    audioState,
    resetAudio,
    resetAudioCache,
    stopAudio
  };
}
