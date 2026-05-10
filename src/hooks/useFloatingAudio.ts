import { useCallback, useEffect, useState } from 'react';
import {
  type FloatingAudioPlaybackState,
  type FloatingAudioTrack
} from '@/components/FloatingAudioPlayer';
import type { AudioState } from '@/types/app';

interface UseFloatingAudioOptions {
  bookId: string | null;
  audioState: AudioState;
  stopAudio: () => void;
  syncFloatingAudioState: (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => void;
}

export function useFloatingAudio(options: UseFloatingAudioOptions) {
  const { bookId, audioState, stopAudio, syncFloatingAudioState } = options;
  const [floatingAudio, setFloatingAudio] = useState<FloatingAudioTrack | null>(null);
  const [floatingAudioPlaybackState, setFloatingAudioPlaybackState] = useState<
    FloatingAudioPlaybackState | 'idle'
  >('idle');

  const playFloatingAudio = useCallback((payload: FloatingAudioTrack) => {
    setFloatingAudio(payload.kind ? payload : { ...payload, kind: 'file' });
    setFloatingAudioPlaybackState('loading');
  }, []);

  const closeFloatingAudio = useCallback(() => {
    if (floatingAudio?.kind === 'page-tts' || floatingAudio?.kind === 'text-tts') {
      stopAudio();
    }
    setFloatingAudio(null);
    setFloatingAudioPlaybackState('idle');
  }, [floatingAudio?.kind, stopAudio]);

  const handlePlaybackStateChange = useCallback(
    (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => {
      setFloatingAudioPlaybackState(state);
      syncFloatingAudioState(state, track);
    },
    [syncFloatingAudioState]
  );

  useEffect(() => {
    setFloatingAudio(null);
    setFloatingAudioPlaybackState('idle');
  }, [bookId]);

  useEffect(() => {
    if (audioState.status !== 'idle' && audioState.status !== 'error') {
      return;
    }
    if (floatingAudio?.kind === 'page-tts' || floatingAudio?.kind === 'text-tts') {
      setFloatingAudio(null);
      setFloatingAudioPlaybackState('idle');
    }
  }, [audioState.status, floatingAudio]);

  return {
    floatingAudio,
    floatingAudioPlaybackState,
    playFloatingAudio,
    closeFloatingAudio,
    handlePlaybackStateChange
  };
}
