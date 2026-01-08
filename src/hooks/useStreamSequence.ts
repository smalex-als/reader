import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageText, StreamState, ToastMessage } from '@/types/app';

const STREAM_CHUNK_SIZE = 1000;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;

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

function stripMarkdown(text: string) {
  let output = text;
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`[^`]*`/g, '');
  output = output.replace(MARKDOWN_IMAGE_PATTERN, '$1');
  output = output.replace(MARKDOWN_LINK_PATTERN, '$1');
  output = output.replace(/[•●◦▪]/g, '-');
  output = output.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  output = output.replace(/^\s{0,3}>\s?/gm, '');
  output = output.replace(/^\s{0,3}[-*+]\s+/gm, '');
  output = output.replace(/^\s{0,3}---+\s*$/gm, '');
  output = output.replace(/\n{3,}/g, '\n\n');
  return output.trim();
}

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

  const splitStreamChunks = useCallback((text: string, startIndex: number) => {
    const input = stripMarkdown(text.slice(Math.max(0, startIndex)));
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < input.length) {
      const slice = input.slice(cursor, cursor + STREAM_CHUNK_SIZE);
      if (cursor + STREAM_CHUNK_SIZE >= input.length) {
        chunks.push(slice.trim());
        break;
      }
      const breakWindow = slice.slice(Math.max(0, slice.length - 200));
      let breakIndex = breakWindow.lastIndexOf('\n\n');
      if (breakIndex === -1) {
        breakIndex = breakWindow.lastIndexOf('\n');
      }
      if (breakIndex === -1) {
        breakIndex = breakWindow.lastIndexOf(' ');
      }
      if (breakIndex === -1) {
        breakIndex = slice.length;
      } else {
        breakIndex += Math.max(0, slice.length - 200);
      }
      const chunk = input.slice(cursor, cursor + breakIndex);
      chunks.push(chunk.trim());
      cursor += Math.max(1, breakIndex);
    }
    return chunks.filter((chunk) => chunk.length > 0);
  }, []);

  const startStreamSequence = useCallback(
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
      splitStreamChunks,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      streamState.status,
      streamVoice
    ]
  );

  const handlePlayStream = useCallback(async () => {
    if (isTextBook) {
      if (!bookId || chapterCount === 0) {
        showToast('No chapter available to stream', 'error');
        return;
      }
      if (!firstChapterParagraph) {
        showToast('No chapter text available to stream', 'error');
        return;
      }
      await startStreamSequence(
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
    startStreamSequence,
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
      await startStreamSequence(payload.fullText, payload.startIndex, payload.key);
    },
    [showToast, startStreamSequence]
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
    void startStreamSequence(pending.fullText, pending.startIndex, pending.baseKey);
  }, [startStreamSequence, streamState.status]);

  return {
    handlePlayStream,
    handlePlayChapterParagraph,
    handleStopStream,
    handleToggleStreamPause
  };
}
