import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { fetchStreamVoices } from '@/api/streamVoices';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  loadMp3VoiceForBook,
  loadStreamVoiceForBook,
  saveMp3VoiceForBook,
  saveStreamVoiceForBook
} from '@/lib/storage';
import {
  appActions,
  selectReaderSession,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { StreamVoice, StreamVoiceOption } from '@/lib/appConstants';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

type VoicePayloads = {
  loadVoices: undefined;
};

type VoiceActions = {
  setVoiceOptions: (voices: StreamVoiceOption[], defaultVoice: StreamVoice) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  showError: (message: string) => void;
};

const voiceHandlers = createActionHandlerRegistry<unknown, VoiceActions, VoicePayloads>();
const { addActionHandler } = voiceHandlers;

addActionHandler('loadVoices', async (_state, actions): Promise<void> => {
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load streaming voices',
    request: fetchStreamVoices,
    onSuccess: ({ voices, defaultVoice }) => {
      actions.setVoiceOptions(voices, defaultVoice);
    },
    onError: (error) => {
      console.error('Unable to load streaming voices', error);
      actions.showError('Unable to load streaming voices');
    }
  });
});

export function useStreamVoices() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
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
  useEffect(() => {
    let cancelled = false;
    const actions: VoiceActions = {
      setVoiceOptions: (voices, defaultVoice) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setVoiceOptions(voices, defaultVoice));
      },
      setLoading: () => undefined,
      setError: () => undefined,
      showError: (message) => {
        if (!cancelled) {
          showToast(message, 'error');
        }
      }
    };
    void voiceHandlers.runAction('loadVoices', undefined, actions, undefined);
    return () => {
      cancelled = true;
    };
  }, [dispatch, showToast]);

  useEffect(() => {
    const storedVoice = bookId ? loadStreamVoiceForBook(bookId) : null;
    const nextVoice =
      storedVoice && isStreamVoice(storedVoice)
        ? storedVoice
        : getDefaultStreamVoice();
    if (streamVoice === nextVoice) {
      return;
    }
    dispatch(appActions.setStreamVoice(nextVoice));
  }, [bookId, dispatch, getDefaultStreamVoice, isStreamVoice, streamVoice]);

  useEffect(() => {
    if (!bookId) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveStreamVoiceForBook(bookId, streamVoice);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [bookId, streamVoice]);

  return {
    streamVoiceOptions,
    defaultStreamVoice,
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    mp3VoiceOptions
  };
}

export function useMp3Voice() {
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const { streamVoiceOptions, mp3Voice } = useAppSelector(selectVoiceWorkflow);
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
