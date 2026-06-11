import { useCallback, useEffect, useMemo } from 'react';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useToast } from '@/hooks/useToast';
import { makeStreamLocator, parseStreamLocator } from '@/lib/streamLocator';
import {
  appActions,
  selectChapterTextContext,
  selectReaderSession,
  selectStreamControlRequest,
  selectStreamRuntime,
  selectStreamUiControls,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

interface UseStreamControlsOptions {
  startStreamSequence: () => Promise<void>;
  handlePlayChapterParagraph: (payload: {
    fullText: string;
    startIndex: number;
    key: string;
  }) => Promise<void>;
  restartStreamFromPageKey: (pageKey: string, voice: string) => Promise<void>;
  handleStopStream: () => void;
  handleToggleStreamPause: () => Promise<void> | void;
}

export function useStreamControls({
  startStreamSequence,
  handlePlayChapterParagraph,
  restartStreamFromPageKey,
  handleStopStream,
  handleToggleStreamPause
}: UseStreamControlsOptions) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { bookId, chapterNumber } = useCurrentChapterContext();
  const { viewMode } = useAppSelector(selectReaderSession);
  const { displayedChapterText } = useAppSelector(selectChapterTextContext);
  const { selectedStreamBlockKey } = useAppSelector(selectStreamUiControls);
  const streamState = useAppSelector(selectStreamRuntime);
  const streamControlRequest = useAppSelector(selectStreamControlRequest);
  const { streamVoiceOptions } = useAppSelector(selectVoiceWorkflow);
  const mp3VoiceOptions = useMemo(
    () =>
      streamVoiceOptions.filter(
        (option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'
      ),
    [streamVoiceOptions]
  );
  const isStreamVoice = useCallback(
    (voice: string) => streamVoiceOptions.length === 0 || streamVoiceOptions.some((option) => option.id === voice),
    [streamVoiceOptions]
  );

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
      dispatch(appActions.setStreamVoice(voice));
      restartActiveStream(voice);
    },
    [dispatch, isStreamVoice, restartActiveStream]
  );

  const handleMp3VoiceChange = useCallback(
    (voice: string) => {
      if (!mp3VoiceOptions.some((option) => option.id === voice)) {
        return;
      }
      dispatch(appActions.setMp3Voice(voice));
    },
    [dispatch, mp3VoiceOptions]
  );

  useEffect(() => {
    if (!streamControlRequest) {
      return;
    }
    if (streamControlRequest.kind === 'playVisible') {
      void handlePlayVisibleStream();
    } else if (streamControlRequest.kind === 'stop') {
      handleStopStream();
    } else if (streamControlRequest.kind === 'togglePause') {
      void handleToggleStreamPause();
    } else {
      handleActiveStreamVoiceChange(streamControlRequest.voice);
    }
    dispatch(appActions.clearStreamControlRequest());
  }, [
    dispatch,
    handleActiveStreamVoiceChange,
    handlePlayVisibleStream,
    handleStopStream,
    handleToggleStreamPause,
    streamControlRequest
  ]);

  return {
    selectedStreamBlockKey,
    setSelectedStreamBlockKey,
    selectedStreamLocator,
    streamPositionActive,
    playingStreamLocator,
    activeStreamLocator,
    activeTextParagraph,
    handlePlayVisibleStream,
    handleMp3VoiceChange
  };
}
