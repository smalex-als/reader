import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectAudioState,
  selectFloatingAudio,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { FloatingAudioTrack } from '@/types/floatingAudio';

export function useFloatingAudio() {
  const dispatch = useAppDispatch();
  const audioState = useAppSelector(selectAudioState);
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
