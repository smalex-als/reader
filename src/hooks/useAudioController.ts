import { useCallback, useRef, useState } from 'react';
import { deriveAudioUrl } from '@/lib/paths';
import type { FloatingAudioTrack } from '@/components/FloatingAudioPlayer';
import type { AudioCacheEntry, AudioState } from '@/types/app';

const INITIAL_AUDIO_STATE: AudioState = {
  status: 'idle',
  url: null,
  source: null,
  provider: null,
  currentPageKey: null
};

export function useAudioController(
  currentImage: string | null,
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
  const [audioCache, setAudioCache] = useState<Record<string, AudioCacheEntry>>({});
  const [audioState, setAudioState] = useState<AudioState>(INITIAL_AUDIO_STATE);
  const lastRequestedProviderRef = useRef<'openai' | 'xai' | null>(null);

  const resetAudio = useCallback(() => {
    lastRequestedProviderRef.current = null;
    setAudioState({ ...INITIAL_AUDIO_STATE });
  }, []);

  const stopAudio = useCallback(() => {
    lastRequestedProviderRef.current = null;
    setAudioState((prev) => ({
      ...prev,
      status: 'idle',
      source: null,
      provider: null,
      currentPageKey: null
    }));
  }, []);

  const playTextAudio = useCallback(
    async ({
      text,
      title,
      subtitle,
      provider = 'openai',
      voice,
      cacheKey
    }: {
      text: string;
      title: string;
      subtitle?: string;
      provider?: 'openai' | 'xai';
      voice?: string;
      cacheKey: string;
    }) => {
      const trackKey = `text:${provider}:${voice ?? 'default'}:${cacheKey}`;
      if (
        audioState.currentPageKey === trackKey &&
        audioState.provider === provider &&
        (audioState.status === 'loading' || audioState.status === 'generating')
      ) {
        showToast('Narration is already in progress…', 'info');
        return null;
      }
      lastRequestedProviderRef.current = provider;
      setAudioState((prev) => ({
        ...prev,
        status: 'loading',
        error: undefined,
        source: null,
        provider,
        currentPageKey: trackKey
      }));
      try {
        let entry: AudioCacheEntry | undefined = audioCache[trackKey];
        if (!entry) {
          setAudioState((prev) => ({
            ...prev,
            status: 'generating',
            error: undefined,
            source: null,
            provider,
            currentPageKey: trackKey
          }));
          showToast(provider === 'xai' ? 'Generating xAI audio…' : 'Generating OpenAI audio…', 'info');
          const response = await fetch('/api/text-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              provider,
              voice: provider === 'xai' ? 'Eve' : voice
            })
          });
          if (!response.ok) {
            throw new Error(`${provider} text audio generation failed`);
          }
          const payload = (await response.json()) as { url?: string; source?: 'file' | 'ai' };
          entry = {
            url: payload.url ?? '',
            source: payload.source ?? 'ai'
          };
          setAudioCache((prev) => ({ ...prev, [trackKey]: entry! }));
        }
        if (!entry.url) {
          throw new Error('Audio URL missing');
        }
        setAudioState((prev) => ({
          ...prev,
          url: entry!.url,
          status: 'loading',
          source: entry!.source,
          provider,
          currentPageKey: trackKey
        }));
        return {
          title,
          subtitle,
          url: entry.url,
          kind: 'text-tts',
          provider,
          pageKey: trackKey
        } satisfies FloatingAudioTrack;
      } catch (error) {
        console.error(error);
        lastRequestedProviderRef.current = null;
        setAudioState((prev) => ({
          ...prev,
          status: 'error',
          source: null,
          provider,
          error: 'Unable to play audio'
        }));
        showToast('Unable to play audio', 'error');
        return null;
      }
    },
    [audioCache, audioState.currentPageKey, audioState.provider, audioState.status, showToast]
  );

  const playAudio = useCallback(async (provider: 'openai' | 'xai' = 'openai', voice?: string) => {
    if (!currentImage) {
      return null;
    }
    if (
      audioState.currentPageKey === currentImage &&
      audioState.provider === provider &&
      (audioState.status === 'loading' || audioState.status === 'generating')
    ) {
      showToast('Narration is already in progress…', 'info');
      return null;
    }
    lastRequestedProviderRef.current = provider;
    setAudioState((prev) => ({
      ...prev,
      status: 'loading',
      error: undefined,
      source: null,
      provider,
      currentPageKey: currentImage
    }));
    try {
      let entry: AudioCacheEntry | undefined = audioCache[currentImage];
      if (provider === 'xai' && entry?.url && !entry.url.endsWith('.xai.mp3')) {
        entry = undefined;
      }
      if (provider === 'openai' && entry?.url && entry.url.endsWith('.xai.mp3')) {
        entry = undefined;
      }
      if (provider === 'openai' && voice) {
        entry = undefined;
      }
      if (!entry) {
        const directUrl = deriveAudioUrl(currentImage, provider);
        if (provider !== 'openai' || !voice) {
          try {
            const headResponse = await fetch(directUrl, { method: 'HEAD' });
            if (headResponse.ok) {
              entry = { url: directUrl, source: 'file' };
            }
          } catch {
            // try API
          }
        }
      }

      if (!entry) {
        setAudioState((prev) => ({
          ...prev,
          status: 'generating',
          error: undefined,
          source: null,
          provider,
          currentPageKey: currentImage
        }));
        showToast(provider === 'xai' ? 'Generating xAI audio…' : 'Streaming audio…', 'info');
        if (provider === 'xai') {
          const response = await fetch('/api/page-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: currentImage, provider: 'xai' })
          });
          if (!response.ok) {
            throw new Error('xAI audio generation failed');
          }
          const payload = (await response.json()) as { url?: string; source?: 'file' | 'ai' };
          entry = {
            url: payload.url ?? deriveAudioUrl(currentImage, 'xai'),
            source: payload.source ?? 'ai'
          };
        } else {
          const params = new URLSearchParams();
          params.set('image', currentImage);
          params.set('t', String(Date.now()));
          if (voice) {
            params.set('voice', voice);
          }
          entry = {
            url: `/api/page-audio/stream?${params.toString()}`,
            source: 'ai'
          };
        }
      }

      if (!entry?.url) {
        throw new Error('Audio URL missing');
      }

      if (entry.source === 'file') {
        setAudioCache((prev) => ({ ...prev, [currentImage]: entry! }));
      }
      setAudioState((prev) => ({
        ...prev,
        url: entry!.url,
        status: 'loading',
        source: entry!.source,
        provider,
        currentPageKey: currentImage
      }));
      return {
        title: provider === 'xai' ? 'xAI TTS' : 'OpenAI TTS',
        subtitle: 'Page narration',
        url: entry.url,
        kind: 'page-tts',
        provider,
        pageKey: currentImage
      } satisfies FloatingAudioTrack;
    } catch (error) {
      console.error(error);
      lastRequestedProviderRef.current = null;
      setAudioState((prev) => ({
        ...prev,
        status: 'error',
        source: null,
        provider,
        error: 'Unable to play audio'
      }));
      showToast('Unable to play audio', 'error');
      return null;
    }
  }, [audioCache, audioState, currentImage, showToast]);

  const syncFloatingAudioState = useCallback(
    (state: 'loading' | 'playing' | 'paused' | 'ended' | 'error', track: FloatingAudioTrack) => {
      if (track.kind !== 'page-tts' && track.kind !== 'text-tts') {
        return;
      }
      const provider = track.provider ?? lastRequestedProviderRef.current ?? 'openai';
      const pageKey = track.pageKey ?? currentImage;
      if (state === 'ended') {
        lastRequestedProviderRef.current = null;
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
    setAudioCache({});
    resetAudio();
  }, [resetAudio]);

  return {
    audioCache,
    audioState,
    playAudio,
    playTextAudio,
    resetAudio,
    resetAudioCache,
    syncFloatingAudioState,
    stopAudio
  };
}
