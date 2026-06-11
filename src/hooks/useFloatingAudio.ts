import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectFloatingAudio,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AudioState } from '@/types/app';
import type { FloatingAudioTrack } from '@/types/floatingAudio';

interface UseFloatingAudioOptions {
  audioState: AudioState;
}

export function useFloatingAudio(options: UseFloatingAudioOptions) {
  const { audioState } = options;
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const { track: floatingAudio, playbackState: floatingAudioPlaybackState } = useAppSelector(selectFloatingAudio);

  const playFloatingAudio = useCallback(
    (payload: FloatingAudioTrack) => {
      dispatch(appActions.playFloatingAudio(payload));
    },
    [dispatch]
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
    playFloatingAudio
  };
}
