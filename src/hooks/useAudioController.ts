import { useCallback, useState } from 'react';
import type { AudioState } from '@/types/app';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'idle',
  url: null,
  source: null,
  provider: null,
  currentPageKey: null
};

export function useAudioController(currentImage: string | null) {
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);

  const resetAudio = useCallback(() => {
    setAudioState({ ...INITIAL_AUDIO_STATE });
  }, []);

  const stopAudio = useCallback(() => {
    setAudioState((prev) => ({
      ...prev,
      status: 'idle',
      source: null,
      provider: null,
      currentPageKey: null
    }));
  }, []);

  const syncFloatingAudioState = useCallback(
    (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => {
      if (track.kind !== 'page-tts' && track.kind !== 'text-tts') {
        return;
      }
      const provider = track.provider === 'xai' ? 'xai' : 'openai';
      const pageKey = track.pageKey ?? currentImage;
      if (state === 'ended') {
        setAudioState((prev) => ({
          ...prev,
          status: 'idle',
          url: track.url,
          source: prev.source ?? 'ai',
          provider: null,
          currentPageKey: null
        }));
        return;
      }
      setAudioState((prev) => ({
        ...prev,
        status: state,
        url: track.url,
        source: prev.source ?? 'ai',
        provider,
        currentPageKey: pageKey ?? null,
        error: state === 'error' ? 'Playback failed' : undefined
      }));
    },
    [currentImage]
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
