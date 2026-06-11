import { useCallback } from 'react';
import {
  appActions,
  selectAudioState,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';

export function useAudioController(currentImage: string | null) {
  const dispatch = useAppDispatch();
  const audioState = useAppSelector(selectAudioState);

  const resetAudio = useCallback(() => {
    dispatch(appActions.resetAudio());
  }, [dispatch]);

  const stopAudio = useCallback(() => {
    dispatch(appActions.stopAudio());
  }, [dispatch]);

  const syncFloatingAudioState = useCallback(
    (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => {
      if (track.kind !== 'page-tts' && track.kind !== 'text-tts') {
        return;
      }
      dispatch(appActions.syncFloatingAudio(state, track, track.pageKey ?? currentImage ?? null));
    },
    [currentImage, dispatch]
  );

  const resetAudioCache = useCallback(() => {
    resetAudio();
  }, [resetAudio]);

  return {
    audioState,
    resetAudio,
    resetAudioCache,
    syncFloatingAudioState,
    stopAudio
  };
}
