import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAudioLibraryItems, fetchSubtitleText } from '@/api/audioLibrary';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import { parseSrt } from '@/lib/subtitles';
import type { AudioLibraryItem, SubtitleCue } from '@/types/audioLibrary';

type AudioLibraryState = {
  items: AudioLibraryItem[];
  loading: boolean;
  subtitleCues: SubtitleCue[];
  subtitlesLoading: boolean;
};

type AudioLibraryPayloads = {
  loadItems: undefined;
  loadSubtitles: {
    srtUrl: string | null;
    requestId: number;
  };
};

type AudioLibraryActions = {
  setItems: (items: AudioLibraryItem[]) => void;
  setLoading: (loading: boolean) => void;
  setSubtitleCues: (cues: SubtitleCue[]) => void;
  setSubtitlesLoading: (loading: boolean) => void;
  setError: (message: string | null) => void;
  showError: (message: string) => void;
  isSubtitleRequestActive: (requestId: number) => boolean;
};

const audioLibraryHandlers = createActionHandlerRegistry<
  AudioLibraryState,
  AudioLibraryActions,
  AudioLibraryPayloads
>();
const { addActionHandler } = audioLibraryHandlers;

addActionHandler('loadItems', async (_state, actions): Promise<void> => {
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load MP3 library.',
    request: fetchAudioLibraryItems,
    onSuccess: actions.setItems,
    onError: (error) => {
      actions.showError(error instanceof Error ? error.message : 'Unable to load MP3 library.');
    }
  });
});

addActionHandler('loadSubtitles', async (_state, actions, { srtUrl, requestId }): Promise<void> => {
  actions.setSubtitleCues([]);
  if (!srtUrl) {
    actions.setSubtitlesLoading(false);
    return;
  }

  await runRequest({
    setBusy: actions.setSubtitlesLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load subtitles for this MP3',
    isActive: () => actions.isSubtitleRequestActive(requestId),
    request: () => fetchSubtitleText(srtUrl),
    onSuccess: (text) => {
      actions.setSubtitleCues(parseSrt(text));
    },
    onError: () => {
      actions.setSubtitleCues([]);
      actions.showError('Unable to load subtitles for this MP3');
    }
  });
});

export function useAudioLibraryActions() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AudioLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const latestSubtitleRequestRef = useRef(0);
  const state = useMemo(
    () => ({
      items,
      loading,
      subtitleCues,
      subtitlesLoading
    }),
    [items, loading, subtitleCues, subtitlesLoading]
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useMemo<AudioLibraryActions>(
    () => ({
      setItems,
      setLoading,
      setSubtitleCues,
      setSubtitlesLoading,
      setError: () => undefined,
      showError: (message) => showToast(message, 'error'),
      isSubtitleRequestActive: (requestId) => latestSubtitleRequestRef.current === requestId
    }),
    [showToast]
  );

  const runAction = useCallback(
    async <T extends keyof AudioLibraryPayloads>(action: T, payload: AudioLibraryPayloads[T]) => {
      await audioLibraryHandlers.runAction(action, stateRef.current, actions, payload);
    },
    [actions]
  );

  const loadItems = useCallback(() => runAction('loadItems', undefined), [runAction]);
  const loadSubtitles = useCallback(
    (srtUrl: string | null) => {
      latestSubtitleRequestRef.current += 1;
      return runAction('loadSubtitles', {
        srtUrl,
        requestId: latestSubtitleRequestRef.current
      });
    },
    [runAction]
  );

  return {
    items,
    loading,
    subtitleCues,
    subtitlesLoading,
    loadItems,
    loadSubtitles
  };
}
