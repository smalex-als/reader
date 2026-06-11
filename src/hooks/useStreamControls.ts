import { useCallback, useEffect, useMemo } from 'react';
import { normalizePlaybackRate } from '@/lib/appConstants';
import { makeStreamLocator, parseStreamLocator } from '@/lib/streamLocator';
import {
  appActions,
  selectStreamUiControls,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { StreamState } from '@/types/app';

interface DisplayedChapterText {
  text: string;
  chapterTitle: string | null;
  versionLabel: string | null;
  versionId: string | null;
}

interface UseStreamControlsOptions {
  bookId: string | null;
  chapterNumber: number | null;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  displayedChapterText: DisplayedChapterText | null;
  streamState: StreamState;
  startStreamSequence: () => Promise<void>;
  handlePlayChapterParagraph: (payload: {
    fullText: string;
    startIndex: number;
    key: string;
  }) => Promise<void>;
  restartStreamFromPageKey: (pageKey: string, voice: string) => Promise<void>;
  isStreamVoice: (voice: string) => boolean;
  setStreamVoice: (voice: string) => void;
  mp3VoiceOptions: ReadonlyArray<{ id: string }>;
  setMp3Voice: (voice: string) => void;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useStreamControls({
  bookId,
  chapterNumber,
  viewMode,
  displayedChapterText,
  streamState,
  startStreamSequence,
  handlePlayChapterParagraph,
  restartStreamFromPageKey,
  isStreamVoice,
  setStreamVoice,
  mp3VoiceOptions,
  setMp3Voice,
  showToast
}: UseStreamControlsOptions) {
  const dispatch = useAppDispatch();
  const { autoFollowStream, selectedStreamBlockKey, playbackRate } = useAppSelector(selectStreamUiControls);

  const setSelectedStreamBlockKey = useCallback(
    (key: string | null) => {
      dispatch(appActions.setSelectedStreamBlockKey(key));
    },
    [dispatch]
  );

  useEffect(() => {
    dispatch(appActions.setSelectedStreamBlockKey(null));
  }, [bookId, dispatch]);

  useEffect(() => {
    if (selectedStreamBlockKey || streamState.status === 'idle' || !streamState.pageKey) {
      return;
    }
    const locator = parseStreamLocator(streamState.pageKey);
    if (locator?.blockId) {
      dispatch(appActions.setSelectedStreamBlockKey(makeStreamLocator(locator.imageUrl, locator.blockId)));
    }
  }, [dispatch, selectedStreamBlockKey, streamState.pageKey, streamState.status]);

  const selectedStreamLocator = useMemo(
    () => parseStreamLocator(selectedStreamBlockKey),
    [selectedStreamBlockKey]
  );
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';
  const playingStreamLocator = useMemo(
    () => parseStreamLocator(streamPositionActive ? streamState.pageKey : null),
    [streamPositionActive, streamState.pageKey]
  );
  const activeStreamLocator = playingStreamLocator ?? selectedStreamLocator;
  const activeTextParagraph = useMemo(() => {
    if (!streamPositionActive || typeof streamState.pageKey !== 'string') {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    const match = streamState.pageKey.match(/^(chapter|narration)::paragraph-start-(\d+)$/);
    if (!match) {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    return {
      mode: match[1] as 'chapter' | 'narration',
      startIndex: Number.parseInt(match[2], 10)
    };
  }, [streamPositionActive, streamState.pageKey]);

  const handlePlayVisibleStream = useCallback(async () => {
    if (viewMode === 'text') {
      if (!displayedChapterText?.text?.trim()) {
        showToast('No visible chapter text available to stream', 'error');
        return;
      }
      await handlePlayChapterParagraph({
        fullText: displayedChapterText.text,
        startIndex: 0,
        key: `chapter-${chapterNumber ?? 'unknown'}-${displayedChapterText.versionId ?? 'base'}`
      });
      return;
    }
    await startStreamSequence();
  }, [
    chapterNumber,
    displayedChapterText,
    handlePlayChapterParagraph,
    showToast,
    startStreamSequence,
    viewMode
  ]);

  const restartActiveStream = useCallback(
    (voice: string) => {
      if (
        (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused') &&
        typeof streamState.pageKey === 'string' &&
        streamState.pageKey
      ) {
        void restartStreamFromPageKey(streamState.pageKey, voice);
      }
    },
    [restartStreamFromPageKey, streamState.pageKey, streamState.status]
  );

  const handleActiveStreamVoiceChange = useCallback(
    (voice: string) => {
      if (!isStreamVoice(voice)) {
        return;
      }
      setStreamVoice(voice);
      restartActiveStream(voice);
    },
    [isStreamVoice, restartActiveStream, setStreamVoice]
  );

  const handleMp3VoiceChange = useCallback(
    (voice: string) => {
      if (!mp3VoiceOptions.some((option) => option.id === voice)) {
        return;
      }
      setMp3Voice(voice);
    },
    [mp3VoiceOptions, setMp3Voice]
  );

  const handlePlaybackRateChange = useCallback((rate: number) => {
    dispatch(appActions.setPlaybackRate(normalizePlaybackRate(rate)));
  }, [dispatch]);

  const toggleAutoFollowStream = useCallback(() => {
    dispatch(appActions.toggleAutoFollowStream());
  }, [dispatch]);

  return {
    autoFollowStream,
    toggleAutoFollowStream,
    selectedStreamBlockKey,
    setSelectedStreamBlockKey,
    selectedStreamLocator,
    streamPositionActive,
    playingStreamLocator,
    activeStreamLocator,
    activeTextParagraph,
    playbackRate,
    handlePlaybackRateChange,
    handlePlayVisibleStream,
    restartActiveStream,
    handleActiveStreamVoiceChange,
    handleMp3VoiceChange
  };
}
