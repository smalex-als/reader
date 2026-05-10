import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { loadMp3VoiceForBook, saveMp3VoiceForBook } from '@/lib/storage';
import type { StreamVoice, StreamVoiceOption } from '@/lib/appConstants';

interface UseStreamVoicesOptions {
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useStreamVoices(options: UseStreamVoicesOptions) {
  const { showToast } = options;
  const [streamVoiceOptions, setStreamVoiceOptions] = useState<StreamVoiceOption[]>([]);
  const [defaultStreamVoice, setDefaultStreamVoice] = useState<StreamVoice>('');
  const [streamVoice, setStreamVoice] = useState<StreamVoice>('');

  const isStreamVoice = useCallback(
    (value: string): value is StreamVoice =>
      streamVoiceOptions.length === 0 || streamVoiceOptions.some((voice) => voice.id === value),
    [streamVoiceOptions]
  );
  const getDefaultStreamVoice = useCallback(
    () => defaultStreamVoice || streamVoiceOptions[0]?.id || '',
    [defaultStreamVoice, streamVoiceOptions]
  );
  const mp3VoiceOptions = useMemo(
    () =>
      streamVoiceOptions.filter(
        (option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'
      ),
    [streamVoiceOptions]
  );
  const getDefaultMp3Voice = useCallback(
    () => mp3VoiceOptions.find((option) => option.provider === 'streaming')?.id || mp3VoiceOptions[0]?.id || '',
    [mp3VoiceOptions]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ defaultVoice?: string; voices?: StreamVoiceOption[] }>('/api/stream-audio/voices')
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const voices = Array.isArray(payload.voices)
          ? payload.voices.filter(
              (voice) =>
                typeof voice.id === 'string' &&
                voice.id.trim() &&
                typeof voice.label === 'string' &&
                (voice.provider === 'openai' ||
                  voice.provider === 'xai' ||
                  voice.provider === 'yandex' ||
                  voice.provider === 'streaming')
            )
          : [];
        const defaultVoice =
          typeof payload.defaultVoice === 'string' && voices.some((voice) => voice.id === payload.defaultVoice)
            ? payload.defaultVoice
            : voices[0]?.id ?? '';
        setStreamVoiceOptions(voices);
        setDefaultStreamVoice(defaultVoice);
        setStreamVoice((previous) => (previous && voices.some((voice) => voice.id === previous) ? previous : defaultVoice));
      })
      .catch((error) => {
        console.error('Unable to load streaming voices', error);
        showToast('Unable to load streaming voices', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  return {
    streamVoiceOptions,
    defaultStreamVoice,
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    mp3VoiceOptions,
    getDefaultMp3Voice
  };
}

interface UseMp3VoiceOptions {
  bookId: string | null;
  mp3VoiceOptions: StreamVoiceOption[];
  getDefaultMp3Voice: () => string;
}

export function useMp3Voice(options: UseMp3VoiceOptions) {
  const { bookId, mp3VoiceOptions, getDefaultMp3Voice } = options;
  const [mp3Voice, setMp3Voice] = useState<StreamVoice>('');

  useEffect(() => {
    if (mp3VoiceOptions.length === 0) {
      setMp3Voice('');
      return;
    }
    const storedVoice = bookId ? loadMp3VoiceForBook(bookId) : null;
    const nextVoice =
      storedVoice && mp3VoiceOptions.some((option) => option.id === storedVoice)
        ? storedVoice
        : getDefaultMp3Voice();
    setMp3Voice((previous) =>
      previous && mp3VoiceOptions.some((option) => option.id === previous) && !storedVoice ? previous : nextVoice
    );
  }, [bookId, getDefaultMp3Voice, mp3VoiceOptions]);

  useEffect(() => {
    if (!bookId || !mp3Voice || !mp3VoiceOptions.some((option) => option.id === mp3Voice)) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveMp3VoiceForBook(bookId, mp3Voice);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [bookId, mp3Voice, mp3VoiceOptions]);

  return { mp3Voice, setMp3Voice };
}
