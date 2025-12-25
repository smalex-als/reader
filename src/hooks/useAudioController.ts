import { useCallback, useEffect, useRef, useState } from 'react';
import { deriveAudioUrl } from '@/lib/paths';
import type { AudioCacheEntry, AudioState } from '@/types/app';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'idle',
  url: null,
  source: null,
  currentPageKey: null
};

export function useAudioController(
  currentImage: string | null,
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
  const [audioCache, setAudioCache] = useState<Record<string, AudioCacheEntry>>({});
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const resetAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setAudioState({ ...INITIAL_AUDIO_STATE });
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setAudioState((prev) => ({
      ...prev,
      status: 'idle',
      source: null,
      currentPageKey: null
    }));
  }, []);

  const playAudio = useCallback(async () => {
    if (!currentImage) {
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (
      audioState.currentPageKey === currentImage &&
      (audioState.status === 'loading' || audioState.status === 'generating')
    ) {
      showToast('Narration is already in progress…', 'info');
      return;
    }
    setAudioState((prev) => ({
      ...prev,
      status: 'loading',
      error: undefined,
      source: null,
      currentPageKey: currentImage
    }));
    try {
      let entry = audioCache[currentImage];
      if (!entry) {
        const directUrl = deriveAudioUrl(currentImage);
        try {
          const headResponse = await fetch(directUrl, { method: 'HEAD' });
          if (headResponse.ok) {
            entry = { url: directUrl, source: 'file' };
          }
        } catch {
          // try API
        }
      }

      if (!entry) {
        const requestBody = {
          image: currentImage
        };
        setAudioState((prev) => ({
          ...prev,
          status: 'generating',
          error: undefined,
          source: null,
          currentPageKey: currentImage
        }));
        showToast('Generating audio…', 'info');
        const response = await fetch('/api/page-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          throw new Error('Failed to generate audio');
        }
        const data = (await response.json()) as AudioCacheEntry;
        entry = data;
      }

      if (!entry?.url) {
        throw new Error('Audio URL missing');
      }

      setAudioCache((prev) => ({ ...prev, [currentImage]: entry! }));
      if (audio.src !== entry.url) {
        audio.src = entry.url;
      }
      await audio.play();
      setAudioState((prev) => ({
        ...prev,
        url: entry!.url,
        status: 'playing',
        source: entry!.source,
        currentPageKey: currentImage
      }));
      showToast(`Playing audio (${entry.source})`, 'info');
    } catch (error) {
      console.error(error);
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        source: null,
        error: 'Unable to play audio'
      }));
      showToast('Unable to play audio', 'error');
    }
  }, [audioCache, audioState, currentImage, showToast]);

  const resetAudioCache = useCallback(() => {
    setAudioCache({});
    resetAudio();
  }, [resetAudio]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handlePlay = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'playing'
      }));
    };
    const handlePause = () => {
      setAudioState((prev) => ({
        ...prev,
        status: audio.ended ? 'idle' : 'paused'
      }));
    };
    const handleEnded = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'idle',
        source: null
      }));
    };
    const handleError = () => {
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        source: null,
        error: 'Playback failed'
      }));
      showToast('Audio playback failed', 'error');
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [showToast]);

  return {
    audioCache,
    audioRef,
    audioState,
    playAudio,
    resetAudio,
    resetAudioCache,
    stopAudio
  };
}
