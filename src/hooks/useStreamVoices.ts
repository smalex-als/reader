import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { useToast } from '@/hooks/useToast';
import { loadMp3VoiceForBook, saveMp3VoiceForBook } from '@/lib/storage';
import {
  appActions,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { StreamVoice, StreamVoiceOption } from '@/lib/appConstants';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useStreamVoices() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { streamVoiceOptions, defaultStreamVoice, streamVoice } = useAppSelector(selectVoiceWorkflow);

  const setStreamVoice: Dispatch<SetStateAction<StreamVoice>> = useCallback(
    (next) => {
      dispatch(appActions.setStreamVoice(resolveNext(next, streamVoice)));
    },
    [dispatch, streamVoice]
  );

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
        dispatch(appActions.setVoiceOptions(voices, defaultVoice));
      })
      .catch((error) => {
        console.error('Unable to load streaming voices', error);
        showToast('Unable to load streaming voices', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, showToast]);

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
  const dispatch = useAppDispatch();
  const { mp3Voice } = useAppSelector(selectVoiceWorkflow);

  const setMp3Voice: Dispatch<SetStateAction<StreamVoice>> = useCallback(
    (next) => {
      dispatch(appActions.setMp3Voice(resolveNext(next, mp3Voice)));
    },
    [dispatch, mp3Voice]
  );

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
  }, [bookId, getDefaultMp3Voice, mp3VoiceOptions, setMp3Voice]);

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
