import { useCallback, useEffect, useRef, useState } from 'react';
import { splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import type { PageText, StreamState, ToastMessage } from '@/types/app';

type ChapterParagraph = {
  fullText: string;
  startIndex: number;
  strippedStartIndex: number;
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
  onSequenceComplete?: (source: 'page' | 'chapter') => void;
};

type StreamSource =
  | { type: 'page' | 'chapter' | 'paragraph'; fullText: string; startIndex: number; baseKey: string }
  | { type: 'single'; text: string; pageKey: string };

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
  streamVoice,
  onSequenceComplete
}: StreamSequenceOptions) {
  const streamSequenceRef = useRef<{
    chunks: { text: string; startIndex: number }[];
    index: number;
    baseKey: string;
  } | null>(null);
  const pendingStreamSequenceRef = useRef<{
    fullText: string;
    startIndex: number;
    strippedStartIndex: number;
    baseKey: string;
    source: 'page' | 'chapter' | 'paragraph';
  } | null>(null);
  const pendingSingleStreamRef = useRef<{ text: string; pageKey: string } | null>(null);
  const lastStreamSourceRef = useRef<StreamSource | null>(null);
  const [streamSequenceActive, setStreamSequenceActive] = useState(false);
  const autoAdvanceRef = useRef(false);

  const stopStreamSequence = useCallback(() => {
    streamSequenceRef.current = null;
    setStreamSequenceActive(false);
  }, []);

  const startStreamSequenceFromText = useCallback(
    async (
      fullText: string,
      startIndex: number,
      strippedStartIndex: number,
      baseKey: string,
      source: 'page' | 'chapter' | 'paragraph'
    ) => {
      lastStreamSourceRef.current = { type: source, fullText, startIndex, baseKey };
      autoAdvanceRef.current = source === 'page' || source === 'chapter';
      if (
        streamState.status === 'connecting' ||
        streamState.status === 'streaming' ||
        streamState.status === 'paused'
      ) {
        pendingStreamSequenceRef.current = { fullText, startIndex, strippedStartIndex, baseKey, source };
        stopStream();
        stopStreamSequence();
        return;
      }
      const chunks = splitStreamChunks(fullText, strippedStartIndex);
      if (chunks.length === 0) {
        showToast('No text available to stream', 'error');
        return;
      }
      stopAudio();
      stopStream();
      stopStreamSequence();
      streamSequenceRef.current = { chunks, index: 0, baseKey };
      setStreamSequenceActive(true);
      await startStream({
        text: chunks[0].text,
        pageKey: `${baseKey}#chunk-0@${chunks[0].startIndex}`,
        voice: streamVoice
      });
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
        firstChapterParagraph.strippedStartIndex,
        firstChapterParagraph.key,
        'chapter'
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
    await startStreamSequenceFromText(textValue, 0, 0, currentImage, 'page');
  }, [
    isTextBook,
    bookId,
    chapterCount,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    showToast,
    startStreamSequenceFromText,
    streamVoice
  ]);

  const handlePlayChapterParagraph = useCallback(
    async (payload: ChapterParagraph) => {
      const trimmed = payload.fullText.trim();
      if (!trimmed) {
        showToast('No paragraph text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(
        payload.fullText,
        payload.startIndex,
        payload.strippedStartIndex,
        payload.key,
        'paragraph'
      );
    },
    [showToast, startStreamSequenceFromText]
  );

  const handleStopStream = useCallback(() => {
    autoAdvanceRef.current = false;
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
      if (autoAdvanceRef.current) {
        const source = lastStreamSourceRef.current;
        if (source && (source.type === 'page' || source.type === 'chapter')) {
          onSequenceComplete?.(source.type);
        }
        autoAdvanceRef.current = false;
        lastStreamSourceRef.current = null;
      }
      stopStreamSequence();
      return;
    }
    sequence.index += 1;
    const nextChunk = sequence.chunks[sequence.index];
    void startStream({
      text: nextChunk.text,
      pageKey: `${sequence.baseKey}#chunk-${sequence.index}@${nextChunk.startIndex}`,
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
    void startStreamSequenceFromText(
      pending.fullText,
      pending.startIndex,
      pending.strippedStartIndex,
      pending.baseKey,
      pending.source
    );
  }, [startStreamSequenceFromText, streamState.status]);

  useEffect(() => {
    if (streamState.status !== 'idle') {
      return;
    }
    const pending = pendingSingleStreamRef.current;
    if (!pending) {
      return;
    }
    pendingSingleStreamRef.current = null;
    stopAudio();
    stopStreamSequence();
    void startStream({ text: pending.text, pageKey: pending.pageKey, voice: streamVoice });
  }, [startStream, stopAudio, stopStreamSequence, streamState.status, streamVoice]);

  return {
    startStreamSequence,
    handlePlayChapterParagraph,
    handleStopStream,
    handleToggleStreamPause
  };
}
