import { useCallback, useEffect, useRef, useState } from 'react';
import { splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import type { PageText, StreamState, ToastMessage } from '@/types/app';

type ChapterParagraph = {
  fullText: string;
  startIndex: number;
  key: string;
};

type StreamSequenceOptions = {
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  isTextBook: boolean;
  bookId: string | null;
  chapterCount: number;
  currentPage: number;
  manifest: string[];
  firstChapterParagraph: ChapterParagraph | null;
  currentImage: string | null;
  currentText: PageText | null;
  fetchPageText: (options?: { force?: boolean; silent?: boolean }) => Promise<PageText | null>;
  fetchPageTextByImage: (
    image: string,
    options?: { force?: boolean; silent?: boolean; updateCurrentState?: boolean }
  ) => Promise<PageText | null>;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
  streamState: StreamState;
  startStream: (payload: { text: string; pageKey: string; voice: string }) => Promise<void>;
  enqueueStream: (payload: { text: string; pageKey: string; voice: string }) => void;
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
  viewMode,
  isTextBook,
  bookId,
  chapterCount,
  currentPage,
  manifest,
  firstChapterParagraph,
  currentImage,
  currentText,
  fetchPageText,
  fetchPageTextByImage,
  showToast,
  streamState,
  startStream,
  enqueueStream,
  stopStream,
  pauseStream,
  resumeStream,
  stopAudio,
  streamVoice,
  onSequenceComplete
}: StreamSequenceOptions) {
  const streamSequenceRef = useRef<{
    source: 'page' | 'chapter' | 'paragraph';
    baseKey: string;
  } | null>(null);
  const pendingStreamSequenceRef = useRef<{
    fullText: string;
    startIndex: number;
    baseKey: string;
    source: 'page' | 'chapter' | 'paragraph';
  } | null>(null);
  const pendingSingleStreamRef = useRef<{ text: string; pageKey: string } | null>(null);
  const lastStreamSourceRef = useRef<StreamSource | null>(null);
  const sequenceRunIdRef = useRef(0);
  const [streamSequenceActive, setStreamSequenceActive] = useState(false);
  const autoAdvanceRef = useRef(false);

  const stopStreamSequence = useCallback(() => {
    sequenceRunIdRef.current += 1;
    streamSequenceRef.current = null;
    setStreamSequenceActive(false);
  }, []);

  const enqueueChunks = useCallback(
    (fullText: string, startIndex: number, baseKey: string) => {
      const chunks = splitStreamChunks(fullText, startIndex);
      for (let index = 1; index < chunks.length; index += 1) {
        enqueueStream({
          text: chunks[index],
          pageKey: `${baseKey}#chunk-${index}`,
          voice: streamVoice
        });
      }
      return chunks;
    },
    [enqueueStream, streamVoice]
  );

  const enqueueFollowingScrollPages = useCallback(
    async (startPageIndex: number, runId: number) => {
      for (let index = startPageIndex; index < manifest.length; index += 1) {
        if (sequenceRunIdRef.current !== runId) {
          return;
        }
        const image = manifest[index];
        if (!image) {
          continue;
        }
        const nextPageText = await fetchPageTextByImage(image, {
          silent: true,
          updateCurrentState: false
        });
        if (sequenceRunIdRef.current !== runId) {
          return;
        }
        const textValue = nextPageText?.plainText?.trim() || '';
        if (!textValue) {
          continue;
        }
        const chunks = splitStreamChunks(textValue, 0);
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          enqueueStream({
            text: chunks[chunkIndex],
            pageKey: `${image}#chunk-${chunkIndex}`,
            voice: streamVoice
          });
        }
      }
    },
    [enqueueStream, fetchPageTextByImage, manifest, streamVoice]
  );

  const startStreamSequenceFromText = useCallback(
    async (fullText: string, startIndex: number, baseKey: string, source: 'page' | 'chapter' | 'paragraph') => {
      lastStreamSourceRef.current = { type: source, fullText, startIndex, baseKey };
      autoAdvanceRef.current = (source === 'page' || source === 'chapter') && viewMode !== 'scroll';
      if (
        streamState.status === 'connecting' ||
        streamState.status === 'streaming' ||
        streamState.status === 'paused'
      ) {
        pendingStreamSequenceRef.current = { fullText, startIndex, baseKey, source };
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
      const runId = sequenceRunIdRef.current + 1;
      sequenceRunIdRef.current = runId;
      streamSequenceRef.current = { source, baseKey };
      setStreamSequenceActive(true);
      await startStream({ text: chunks[0], pageKey: `${baseKey}#chunk-0`, voice: streamVoice });
      enqueueChunks(fullText, startIndex, baseKey);
      if (source === 'page' && viewMode === 'scroll' && !isTextBook) {
        void enqueueFollowingScrollPages(currentPage + 1, runId);
      }
    },
    [
      currentPage,
      enqueueChunks,
      enqueueFollowingScrollPages,
      showToast,
      isTextBook,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      streamState.status,
      streamVoice,
      viewMode
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
        firstChapterParagraph.key,
        'chapter'
      );
      return;
    }
      if (!currentImage) {
        return;
      }
      const pageText = currentText ?? (await fetchPageText());
    const textValue = pageText?.plainText || '';
    if (!textValue) {
      showToast('No page text available to stream', 'error');
      return;
    }
    await startStreamSequenceFromText(textValue, 0, currentImage, 'page');
  }, [
    isTextBook,
    bookId,
    chapterCount,
    currentPage,
    manifest,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    showToast,
    startStreamSequenceFromText,
    streamVoice,
    viewMode
  ]);

  const handlePlayChapterParagraph = useCallback(
    async (payload: ChapterParagraph) => {
      const trimmed = payload.fullText.trim();
      if (!trimmed) {
        showToast('No paragraph text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(payload.fullText, payload.startIndex, payload.key, 'paragraph');
    },
    [showToast, startStreamSequenceFromText]
  );

  const handlePlayPageBlock = useCallback(
    async (payload: { imageUrl: string; startIndex: number; blockId: string }) => {
      if (!payload.imageUrl) {
        return;
      }
      const pageText =
        payload.imageUrl === currentImage
          ? currentText ?? (await fetchPageText({ silent: true }))
          : await fetchPageTextByImage(payload.imageUrl, { silent: true, updateCurrentState: false });
      const textValue = pageText?.plainText || '';
      if (!textValue) {
        showToast('No page text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(
        textValue,
        payload.startIndex,
        `${payload.imageUrl}#${payload.blockId}`,
        'page'
      );
    },
    [
      currentImage,
      currentText,
      fetchPageText,
      fetchPageTextByImage,
      showToast,
      startStreamSequenceFromText
    ]
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
    if (autoAdvanceRef.current) {
      const source = lastStreamSourceRef.current;
      if (source && (source.type === 'page' || source.type === 'chapter')) {
        onSequenceComplete?.(source.type);
      }
      autoAdvanceRef.current = false;
      lastStreamSourceRef.current = null;
    }
    stopStreamSequence();
  }, [onSequenceComplete, stopStreamSequence, streamSequenceActive, streamState.status]);

  useEffect(() => {
    if (streamState.status !== 'idle') {
      return;
    }
    const pending = pendingStreamSequenceRef.current;
    if (!pending) {
      return;
    }
    pendingStreamSequenceRef.current = null;
    void startStreamSequenceFromText(pending.fullText, pending.startIndex, pending.baseKey, pending.source);
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
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handleStopStream,
    handleToggleStreamPause
  };
}
