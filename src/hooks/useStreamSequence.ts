import { useCallback, useEffect, useRef, useState } from 'react';
import { makeStreamLocator, parseStreamLocator } from '@/lib/streamLocator';
import { normalizeFencedCodeBlocksForSpeech, splitStreamChunks, stripMarkdown } from '@/lib/streamText';
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

type PageStreamSegment = {
  text: string;
  pageKey: string;
};

type ParagraphStreamSegment = {
  text: string;
  pageKey: string;
};

type ActiveStreamStatus = 'connecting' | 'streaming' | 'paused';

const ACTIVE_STREAM_STATUSES = new Set<ActiveStreamStatus>(['connecting', 'streaming', 'paused']);
const SCROLL_STREAM_LOOKAHEAD = 2;
const PARAGRAPH_STREAM_LOOKAHEAD = 2;
const STREAM_RESTART_DELAY_MS = 120;

function getTextModeFromBaseKey(baseKey: string) {
  if (baseKey.startsWith('narration-')) {
    return 'narration';
  }
  return 'chapter';
}

function createParagraphStreamSegments(fullText: string, startIndex: number, baseKey: string): ParagraphStreamSegment[] {
  const input = normalizeFencedCodeBlocksForSpeech(fullText.slice(Math.max(0, startIndex)));
  const textMode = getTextModeFromBaseKey(baseKey);
  const segments: ParagraphStreamSegment[] = [];
  const paragraphPattern = /\S[\s\S]*?(?=(?:\n\s*\n)|$)/g;
  let match;

  while ((match = paragraphPattern.exec(input)) !== null) {
    const rawParagraph = match[0]?.trim();
    if (!rawParagraph) {
      continue;
    }
    const spokenParagraph = stripMarkdown(rawParagraph).trim();
    if (!spokenParagraph) {
      continue;
    }
    const absoluteStart = startIndex + match.index;
    const pageKey = `${textMode}::paragraph-start-${absoluteStart}`;
    if (spokenParagraph.length <= 1240) {
      segments.push({ text: spokenParagraph, pageKey });
      continue;
    }
    const paragraphChunks = splitStreamChunks(spokenParagraph, 0);
    for (const chunk of paragraphChunks) {
      segments.push({ text: chunk, pageKey });
    }
  }

  return segments;
}

function getPageStreamSegments(pageText: PageText, imageUrl: string): PageStreamSegment[] {
  const orderedBlocks = [...pageText.blocks]
    .filter((block) => block.startIndex !== null && !block.excludedFromSpeech)
    .sort((left, right) => (left.startIndex ?? 0) - (right.startIndex ?? 0));

  if (orderedBlocks.length === 0) {
    const text = pageText.plainText.trim();
    return text ? [{ text, pageKey: `${imageUrl}::page` }] : [];
  }

  const segments: PageStreamSegment[] = [];
  for (let index = 0; index < orderedBlocks.length; index += 1) {
    const block = orderedBlocks[index];
    const startIndex = block.startIndex ?? 0;
    const nextBlock = orderedBlocks[index + 1];
    const endIndex = nextBlock?.startIndex ?? pageText.plainText.length;
    const text = pageText.plainText.slice(startIndex, endIndex).trim();
    if (!text) {
      continue;
    }
    segments.push({
      text,
      pageKey: `${imageUrl}::${block.id}`
    });
  }

  return segments;
}

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
    voiceOverride?: string;
  } | null>(null);
  const pendingSingleStreamRef = useRef<{ text: string; pageKey: string; voiceOverride?: string } | null>(null);
  const lastStreamSourceRef = useRef<StreamSource | null>(null);
  const sequenceRunIdRef = useRef(0);
  const scrollBufferRef = useRef<{
    runId: number;
    nextPageIndex: number;
    pendingSegments: PageStreamSegment[];
    queuedAhead: number;
    lastActivePageKey: string | null;
    filling: boolean;
  } | null>(null);
  const paragraphBufferRef = useRef<{
    runId: number;
    pendingSegments: ParagraphStreamSegment[];
    queuedAhead: number;
    lastActivePageKey: string | null;
  } | null>(null);
  const [streamSequenceActive, setStreamSequenceActive] = useState(false);
  const autoAdvanceRef = useRef(false);
  const pendingRestartTimerRef = useRef<number | null>(null);

  const clearPendingRestartTimer = useCallback(() => {
    if (pendingRestartTimerRef.current !== null) {
      window.clearTimeout(pendingRestartTimerRef.current);
      pendingRestartTimerRef.current = null;
    }
  }, []);

  const stopStreamSequence = useCallback(() => {
    clearPendingRestartTimer();
    sequenceRunIdRef.current += 1;
    scrollBufferRef.current = null;
    paragraphBufferRef.current = null;
    streamSequenceRef.current = null;
    setStreamSequenceActive(false);
  }, [clearPendingRestartTimer]);

  const isStreamBusy = useCallback(
    (status: StreamState['status']) => ACTIVE_STREAM_STATUSES.has(status as ActiveStreamStatus),
    []
  );

  const resetCurrentSequence = useCallback(() => {
    stopAudio();
    stopStream();
    stopStreamSequence();
  }, [stopAudio, stopStream, stopStreamSequence]);

  const getPageTextForImage = useCallback(
    async (imageUrl: string, preferCurrentState = false) => {
      if (!imageUrl) {
        return null;
      }
      if (preferCurrentState && imageUrl === currentImage) {
        return currentText ?? (await fetchPageText({ silent: true }));
      }
      return fetchPageTextByImage(imageUrl, { silent: true, updateCurrentState: false });
    },
    [currentImage, currentText, fetchPageText, fetchPageTextByImage]
  );

  const enqueueChunks = useCallback(
    (fullText: string, startIndex: number, baseKey: string, voiceOverride?: string) => {
      const voice = voiceOverride ?? streamVoice;
      const chunks = splitStreamChunks(fullText, startIndex);
      for (let index = 1; index < chunks.length; index += 1) {
        enqueueStream({
          text: chunks[index],
          pageKey: `${baseKey}#chunk-${index}`,
          voice
        });
      }
      return chunks;
    },
    [enqueueStream, streamVoice]
  );

  const fillParagraphBuffer = useCallback(
    (runId: number, voiceOverride?: string) => {
      const voice = voiceOverride ?? streamVoice;
      const buffer = paragraphBufferRef.current;
      if (!buffer || buffer.runId !== runId) {
        return;
      }
      while (sequenceRunIdRef.current === runId && buffer.queuedAhead < PARAGRAPH_STREAM_LOOKAHEAD) {
        const nextSegment = buffer.pendingSegments.shift();
        if (!nextSegment) {
          break;
        }
        enqueueStream({
          text: nextSegment.text,
          pageKey: nextSegment.pageKey,
          voice
        });
        buffer.queuedAhead += 1;
      }
    },
    [enqueueStream, streamVoice]
  );

  const fillScrollBuffer = useCallback(
    async (runId: number, voiceOverride?: string) => {
      const voice = voiceOverride ?? streamVoice;
      const buffer = scrollBufferRef.current;
      if (!buffer || buffer.runId !== runId || buffer.filling) {
        return;
      }
      buffer.filling = true;
      try {
        while (sequenceRunIdRef.current === runId && buffer.queuedAhead < SCROLL_STREAM_LOOKAHEAD) {
          if (buffer.pendingSegments.length === 0) {
            if (buffer.nextPageIndex >= manifest.length) {
              break;
            }
            const image = manifest[buffer.nextPageIndex];
            buffer.nextPageIndex += 1;
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
            if (!nextPageText) {
              continue;
            }
            buffer.pendingSegments.push(...getPageStreamSegments(nextPageText, image));
            continue;
          }
          const nextSegment = buffer.pendingSegments.shift();
          if (!nextSegment) {
            continue;
          }
          enqueueStream({
            text: nextSegment.text,
            pageKey: nextSegment.pageKey,
            voice
          });
          buffer.queuedAhead += 1;
        }
      } finally {
        const latest = scrollBufferRef.current;
        if (latest && latest.runId === runId) {
          latest.filling = false;
        }
      }
    },
    [enqueueStream, fetchPageTextByImage, manifest, streamVoice]
  );

  const startScrollPageSequence = useCallback(
    async (
      imageUrl: string,
      pageText: PageText,
      startBlockId?: string,
      continueAcrossPages = true,
      voiceOverride?: string
    ) => {
      const voice = voiceOverride ?? streamVoice;
      const allSegments = getPageStreamSegments(pageText, imageUrl);
      if (allSegments.length === 0) {
        showToast('No page text available to stream', 'error');
        return;
      }
      const startSegmentIndex = startBlockId
        ? Math.max(
            0,
            allSegments.findIndex((segment) => segment.pageKey === `${imageUrl}::${startBlockId}`)
          )
        : 0;
      const segments = allSegments.slice(startSegmentIndex);
      if (segments.length === 0) {
        showToast('No page text available to stream', 'error');
        return;
      }

      lastStreamSourceRef.current = {
        type: 'page',
        fullText: pageText.plainText,
        startIndex: 0,
        baseKey: imageUrl
      };
      autoAdvanceRef.current = false;

      if (isStreamBusy(streamState.status)) {
        stopStream();
        stopStreamSequence();
      }

      resetCurrentSequence();
      const runId = sequenceRunIdRef.current + 1;
      sequenceRunIdRef.current = runId;
      const imagePageIndex = manifest.findIndex((entry) => entry === imageUrl);
      scrollBufferRef.current = continueAcrossPages
        ? {
            runId,
            nextPageIndex: imagePageIndex >= 0 ? imagePageIndex + 1 : currentPage + 1,
            pendingSegments: segments.slice(1),
            queuedAhead: 0,
            lastActivePageKey: segments[0].pageKey,
            filling: false
          }
        : {
            runId,
            nextPageIndex: manifest.length,
            pendingSegments: segments.slice(1),
            queuedAhead: 0,
            lastActivePageKey: segments[0].pageKey,
            filling: false
          };
      streamSequenceRef.current = { source: 'page', baseKey: imageUrl };
      setStreamSequenceActive(true);
      await startStream({
        text: segments[0].text,
        pageKey: segments[0].pageKey,
        voice
      });
      void fillScrollBuffer(runId, voice);
    },
    [
      currentPage,
      fillScrollBuffer,
      manifest,
      showToast,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      isStreamBusy,
      resetCurrentSequence,
      streamState.status,
      streamVoice
    ]
  );

  const startStreamSequenceFromText = useCallback(
    async (
      fullText: string,
      startIndex: number,
      baseKey: string,
      source: 'page' | 'chapter' | 'paragraph',
      voiceOverride?: string
    ) => {
      const voice = voiceOverride ?? streamVoice;
      lastStreamSourceRef.current = { type: source, fullText, startIndex, baseKey };
      autoAdvanceRef.current = (source === 'page' || source === 'chapter') && viewMode !== 'scroll';
      if (isStreamBusy(streamState.status)) {
        pendingStreamSequenceRef.current = { fullText, startIndex, baseKey, source, voiceOverride };
        stopStream();
        stopStreamSequence();
        return;
      }
      const paragraphMode = source === 'chapter' || source === 'paragraph';
      const paragraphSegments = paragraphMode ? createParagraphStreamSegments(fullText, startIndex, baseKey) : null;
      resetCurrentSequence();
      const runId = sequenceRunIdRef.current + 1;
      sequenceRunIdRef.current = runId;
      streamSequenceRef.current = { source, baseKey };
      setStreamSequenceActive(true);
      if (paragraphMode && paragraphSegments) {
        if (paragraphSegments.length === 0) {
          showToast('No text available to stream', 'error');
          return;
        }
        paragraphBufferRef.current = {
          runId,
          pendingSegments: paragraphSegments.slice(1),
          queuedAhead: 0,
          lastActivePageKey: paragraphSegments[0].pageKey
        };
        await startStream({
          text: paragraphSegments[0].text,
          pageKey: paragraphSegments[0].pageKey,
          voice
        });
        fillParagraphBuffer(runId, voice);
        return;
      }
      const chunks = splitStreamChunks(fullText, startIndex);
      if (chunks.length === 0) {
        showToast('No text available to stream', 'error');
        return;
      }
      await startStream({
        text: chunks[0],
        pageKey: `${baseKey}#chunk-0`,
        voice
      });
      enqueueChunks(fullText, startIndex, baseKey, voice);
    },
    [
      enqueueChunks,
      fillParagraphBuffer,
      showToast,
      startStream,
      stopAudio,
      stopStream,
      stopStreamSequence,
      isStreamBusy,
      resetCurrentSequence,
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
    if (viewMode === 'scroll' && pageText) {
      await startScrollPageSequence(currentImage, pageText);
      return;
    }
    await startStreamSequenceFromText(textValue, 0, currentImage, 'page');
  }, [
    isTextBook,
    bookId,
    chapterCount,
    currentPage,
    firstChapterParagraph,
    currentImage,
    currentText,
    fetchPageText,
    showToast,
    startScrollPageSequence,
    startStreamSequenceFromText,
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

  const handlePlaySingleStream = useCallback(
    async (payload: { text: string; pageKey: string }, voiceOverride?: string) => {
      const voice = voiceOverride ?? streamVoice;
      const trimmed = stripMarkdown(payload.text).trim();
      if (!trimmed) {
        showToast('No text available to stream', 'error');
        return;
      }
      lastStreamSourceRef.current = { type: 'single', text: trimmed, pageKey: payload.pageKey };
      autoAdvanceRef.current = false;
      if (isStreamBusy(streamState.status)) {
        pendingSingleStreamRef.current = { text: trimmed, pageKey: payload.pageKey, voiceOverride };
        stopStream();
        stopStreamSequence();
        return;
      }
      pendingSingleStreamRef.current = null;
      stopAudio();
      stopStreamSequence();
      await startStream({ text: trimmed, pageKey: payload.pageKey, voice });
    },
    [isStreamBusy, showToast, startStream, stopAudio, stopStream, stopStreamSequence, streamState.status, streamVoice]
  );

  const handlePlayPageBlock = useCallback(
    async (payload: { imageUrl: string; startIndex: number; blockId: string }, voiceOverride?: string) => {
      if (!payload.imageUrl) {
        return;
      }
      const pageText = await getPageTextForImage(payload.imageUrl, true);
      const textValue = pageText?.plainText || '';
      if (!textValue) {
        showToast('No page text available to stream', 'error');
        return;
      }
      if (pageText) {
        await startScrollPageSequence(payload.imageUrl, pageText, payload.blockId, viewMode === 'scroll', voiceOverride);
        return;
      }
      await startStreamSequenceFromText(
        textValue,
        payload.startIndex,
        makeStreamLocator(payload.imageUrl, payload.blockId),
        'page',
        voiceOverride
      );
    },
    [
      currentImage,
      getPageTextForImage,
      showToast,
      startScrollPageSequence,
      startStreamSequenceFromText,
      viewMode
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

  const restartStreamFromPageKey = useCallback(
    async (pageKey: string, voiceOverride: string) => {
      const source = lastStreamSourceRef.current;
      if (source?.type === 'single' && source.pageKey === pageKey) {
        await handlePlaySingleStream({ text: source.text, pageKey }, voiceOverride);
        return;
      }

      const paragraphMatch = pageKey.match(/^(chapter|narration)::paragraph-start-(\d+)$/);
      if (paragraphMatch) {
        const startIndex = Number.parseInt(paragraphMatch[2], 10);
        if (source && (source.type === 'chapter' || source.type === 'paragraph')) {
          await startStreamSequenceFromText(source.fullText, startIndex, source.baseKey, 'paragraph', voiceOverride);
          return;
        }
        if (firstChapterParagraph) {
          await startStreamSequenceFromText(
            firstChapterParagraph.fullText,
            startIndex,
            firstChapterParagraph.key,
            'paragraph',
            voiceOverride
          );
        }
        return;
      }

      const locator = parseStreamLocator(pageKey);
      if (locator?.imageUrl && locator.blockId) {
        await handlePlayPageBlock(
          {
            imageUrl: locator.imageUrl,
            startIndex: 0,
            blockId: locator.blockId
          },
          voiceOverride
        );
        return;
      }

      if (source?.type === 'page' && (pageKey === source.baseKey || pageKey.startsWith(`${source.baseKey}#chunk-`))) {
        await startStreamSequenceFromText(source.fullText, source.startIndex, source.baseKey, 'page', voiceOverride);
        return;
      }
    },
    [firstChapterParagraph, handlePlayPageBlock, handlePlaySingleStream, startStreamSequenceFromText]
  );

  useEffect(() => {
    const buffer = scrollBufferRef.current;
    if (!buffer || streamState.status !== 'streaming' || !streamState.pageKey) {
      return;
    }
    if (streamState.pageKey === buffer.lastActivePageKey) {
      return;
    }
    buffer.lastActivePageKey = streamState.pageKey;
    buffer.queuedAhead = Math.max(0, buffer.queuedAhead - 1);
    void fillScrollBuffer(buffer.runId);
  }, [fillScrollBuffer, streamState.pageKey, streamState.status]);

  useEffect(() => {
    const buffer = paragraphBufferRef.current;
    if (!buffer || streamState.status !== 'streaming' || !streamState.pageKey) {
      return;
    }
    if (streamState.pageKey === buffer.lastActivePageKey) {
      return;
    }
    buffer.lastActivePageKey = streamState.pageKey;
    buffer.queuedAhead = Math.max(0, buffer.queuedAhead - 1);
    fillParagraphBuffer(buffer.runId);
  }, [fillParagraphBuffer, streamState.pageKey, streamState.status]);

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
      clearPendingRestartTimer();
      return;
    }
    const pending = pendingStreamSequenceRef.current;
    if (!pending) {
      return;
    }
    clearPendingRestartTimer();
    pendingRestartTimerRef.current = window.setTimeout(() => {
      pendingRestartTimerRef.current = null;
      const nextPending = pendingStreamSequenceRef.current;
      if (!nextPending || streamState.status !== 'idle') {
        return;
      }
      pendingStreamSequenceRef.current = null;
      void startStreamSequenceFromText(
        nextPending.fullText,
        nextPending.startIndex,
        nextPending.baseKey,
        nextPending.source,
        nextPending.voiceOverride
      );
    }, STREAM_RESTART_DELAY_MS);
  }, [clearPendingRestartTimer, startStreamSequenceFromText, streamState.status]);

  useEffect(() => {
    if (streamState.status !== 'idle') {
      clearPendingRestartTimer();
      return;
    }
    const pending = pendingSingleStreamRef.current;
    if (!pending) {
      return;
    }
    clearPendingRestartTimer();
    pendingRestartTimerRef.current = window.setTimeout(() => {
      pendingRestartTimerRef.current = null;
      const nextPending = pendingSingleStreamRef.current;
      if (!nextPending || streamState.status !== 'idle') {
        return;
      }
      pendingSingleStreamRef.current = null;
      stopAudio();
      stopStreamSequence();
      void startStream({
        text: nextPending.text,
        pageKey: nextPending.pageKey,
        voice: nextPending.voiceOverride ?? streamVoice
      });
    }, STREAM_RESTART_DELAY_MS);
  }, [clearPendingRestartTimer, startStream, stopAudio, stopStreamSequence, streamState.status, streamVoice]);

  useEffect(() => () => clearPendingRestartTimer(), [clearPendingRestartTimer]);

  return {
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleStopStream,
    handleToggleStreamPause,
    restartStreamFromPageKey
  };
}
