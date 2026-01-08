import { useCallback, useEffect, useRef, useState } from 'react';
import { splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import type { PageText, StreamState, ToastMessage } from '@/types/app';

type ChapterParagraph = {
  fullText: string;
  startIndex: number;
  key: string;
};

type StreamSequenceOptions = {
  isTextBook: boolean;
  bookId: string | null;
  chapterCount: number;
  firstChapterParagraph: ChapterParagraph | null;
  currentImage: string | null;
  currentText: PageText | null;
  fetchPageText: (force?: boolean) => Promise<PageText | null>;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
  streamState: StreamState;
  startStream: (payload: { text: string; pageKey: string; voice: string }) => Promise<void>;
  stopStream: () => void;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  stopAudio: () => void;
  streamVoice: string;
};

export function useStreamSequence({
  isTextBook,
  bookId,
  chapterCount,
  firstChapterParagraph,
  currentImage,
  currentText,
  fetchPageText,
  showToast,
  streamState,
  startStream,
  stopStream,
  pauseStream,
  resumeStream,
  stopAudio,
  streamVoice
}: StreamSequenceOptions) {
  const streamSequenceRef = useRef<{
    chunks: string[];
    index: number;
    baseKey: string;
  } | null>(null);
  const pendingStreamSequenceRef = useRef<{
    fullText: string;
    startIndex: number;
    baseKey: string;
  } | null>(null);
  const [streamSequenceActive, setStreamSequenceActive] = useState(false);

  const stopStreamSequence = useCallback(() => {
    streamSequenceRef.current = null;
    setStreamSequenceActive(false);
  }, []);

  const startStreamSequenceFromText = useCallback(
    async (fullText: string, startIndex: number, baseKey: string) => {
      if (
        streamState.status === 'connecting' ||
        streamState.status === 'streaming' ||
        streamState.status === 'paused'
      ) {
        pendingStreamSequenceRef.current = { fullText, startIndex, baseKey };
        stopStream();
        stopStreamSequence();
        return;
      }
      const chunks = splitStreamChunks(fullText, startIndex);
      if (chunks.length === 0) {
        showToast('No text available to stream', 'error');
        return;
      }
      stopAudio();
      stopStream();
      stopStreamSequence();
      streamSequenceRef.current = { chunks, index: 0, baseKey };
      setStreamSequenceActive(true);
      await startStream({ text: chunks[0], pageKey: `${baseKey}#chunk-0`, voice: streamVoice });
    },
    [
      showToast,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      streamState.status,
      streamVoice
    ]
  );

  const startStreamSequence = useCallback(async () => {
    if (isTextBook) {
      if (!bookId || chapterCount === 0) {
        showToast('No chapter available to stream', 'error');
        return;
      }
      if (!firstChapterParagraph) {
        showToast('No chapter text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(
        firstChapterParagraph.fullText,
        firstChapterParagraph.startIndex,
        firstChapterParagraph.key
      );
      return;
    }
    if (!currentImage) {
      return;
    }
    const pageText = currentText ?? (await fetchPageText());
    const textValue = stripMarkdown(pageText?.text || '');
    if (!textValue) {
      showToast('No page text available to stream', 'error');
      return;
    }
    stopAudio();
    stopStreamSequence();
    await startStream({ text: textValue, pageKey: currentImage, voice: streamVoice });
  }, [
    isTextBook,
    bookId,
    chapterCount,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    showToast,
    startStream,
    startStreamSequenceFromText,
    stopAudio,
    stopStreamSequence,
    streamVoice
  ]);

  const handlePlayChapterParagraph = useCallback(
    async (payload: ChapterParagraph) => {
      const trimmed = payload.fullText.trim();
      if (!trimmed) {
        showToast('No paragraph text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(payload.fullText, payload.startIndex, payload.key);
    },
    [showToast, startStreamSequenceFromText]
  );

  const handleStopStream = useCallback(() => {
    stopStream();
    stopStreamSequence();
  }, [stopStream, stopStreamSequence]);

  const handleToggleStreamPause = useCallback(async () => {
    if (streamState.status === 'paused') {
      await resumeStream();
      return;
    }
    if (streamState.status === 'streaming') {
      await pauseStream();
    }
  }, [pauseStream, resumeStream, streamState.status]);

  useEffect(() => {
    if (!streamSequenceActive || streamState.status !== 'idle') {
      return;
    }
    const sequence = streamSequenceRef.current;
    if (!sequence) {
      setStreamSequenceActive(false);
      return;
    }
    if (sequence.index >= sequence.chunks.length - 1) {
      stopStreamSequence();
      return;
    }
    sequence.index += 1;
    void startStream({
      text: sequence.chunks[sequence.index],
      pageKey: `${sequence.baseKey}#chunk-${sequence.index}`,
      voice: streamVoice
    });
  }, [startStream, stopStreamSequence, streamSequenceActive, streamState.status, streamVoice]);

  useEffect(() => {
    if (streamState.status !== 'idle') {
      return;
    }
    const pending = pendingStreamSequenceRef.current;
    if (!pending) {
      return;
    }
    pendingStreamSequenceRef.current = null;
    void startStreamSequenceFromText(pending.fullText, pending.startIndex, pending.baseKey);
  }, [startStreamSequenceFromText, streamState.status]);

  return {
    startStreamSequence,
    handlePlayChapterParagraph,
    handleStopStream,
    handleToggleStreamPause
  };
}
