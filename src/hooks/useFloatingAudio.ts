import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectFloatingAudio,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AudioState } from '@/types/app';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';

interface UseFloatingAudioOptions {
  bookId: string | null;
  audioState: AudioState;
  syncFloatingAudioState: (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => void;
}

export function useFloatingAudio(options: UseFloatingAudioOptions) {
  const { bookId, audioState, syncFloatingAudioState } = options;
  const dispatch = useAppDispatch();
  const { track: floatingAudio, playbackState: floatingAudioPlaybackState } = useAppSelector(selectFloatingAudio);

  const playFloatingAudio = useCallback(
    (payload: FloatingAudioTrack) => {
      dispatch(appActions.playFloatingAudio(payload));
    },
    [dispatch]
  );

  const handlePlaybackStateChange = useCallback(
    (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => {
      dispatch(appActions.setFloatingAudioPlaybackState(state));
      syncFloatingAudioState(state, track);
    },
    [dispatch, syncFloatingAudioState]
  );

  useEffect(() => {
    dispatch(appActions.closeFloatingAudio());
  }, [bookId, dispatch]);

  useEffect(() => {
    if (audioState.status !== 'idle' && audioState.status !== 'error') {
      return;
    }
    if (floatingAudio?.kind === 'page-tts' || floatingAudio?.kind === 'text-tts') {
      dispatch(appActions.closeFloatingAudio());
    }
  }, [audioState.status, dispatch, floatingAudio]);

  return {
    floatingAudioPlaybackState,
    playFloatingAudio,
    handlePlaybackStateChange
  };
}
