import { StreamLookaheadController, type StreamLookaheadEnvironment } from '@/lib/streamLookaheadController';
import { parseStreamLocator } from '@/lib/streamLocator';
import { StreamRestartCoordinator, type RestartTimerScheduler } from '@/lib/streamRestartCoordinator';
import { StreamStudyReplayGuard } from '@/lib/streamStudyReplayGuard';
import {
  createStreamSequenceMachineState,
  isCurrentStreamSequenceRun,
  transitionStreamSequenceMachine,
  type StreamSequenceMachineEvent
} from '@/lib/streamSequenceMachine';
import {
  createParagraphStreamSegments,
  getPageStreamSegments,
  parseParagraphPageKey
} from '@/lib/streamSequenceSegments';
import { splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import type { PageText, StreamState } from '@/types/app';

type StreamSource =
  | { type: 'page' | 'chapter' | 'paragraph'; fullText: string; startIndex: number; baseKey: string }
  | { type: 'single'; text: string; pageKey: string };

type ChapterParagraph = {
  fullText: string;
  startIndex: number;
  key: string;
};

export type StreamSequenceEnvironment = {
  bookId: string | null;
  currentPage: number;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  bookType: 'image' | 'text';
  chapterCount: number;
  manifest: string[];
  firstChapterParagraph: ChapterParagraph | null;
  streamState: Pick<StreamState, 'status' | 'pageKey' | 'playbackSeconds'>;
  studyMode: boolean;
  streamVoice: string;
  textCache: Record<string, PageText>;
  startStream: (payload: {
    text: string;
    pageKey: string;
    voice: string;
    pauseAtStartOnComplete?: boolean;
    replaceCurrent?: boolean;
  }) => Promise<void>;
  enqueueStream: (payload: { text: string; pageKey: string; voice: string }) => void;
  stopStream: () => void;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  pauseStreamAtStart: (pageKey: string) => void;
  stopAudio: () => void;
  showToast: (message: string, type: 'info' | 'error') => void;
  requestNextPage: () => void;
};

export type StreamSequenceController = {
  updateEnvironment: (environment: StreamSequenceEnvironment) => void;
  mount: () => void;
  dispose: () => void;
  syncRuntime: () => void;
  startStreamSequence: () => Promise<void>;
  handlePlayPageBlock: (
    payload: { imageUrl: string; startIndex: number; blockId: string },
    voiceOverride?: string
  ) => Promise<void>;
  handlePlayChapterParagraph: (payload: ChapterParagraph) => Promise<void>;
  handlePlaySingleStream: (
    payload: { text: string; pageKey: string },
    voiceOverride?: string
  ) => Promise<void>;
  handleStopStream: () => void;
  handleToggleStreamPause: () => Promise<void>;
  handlePlayNextStudyBlock: () => Promise<void>;
  restartStreamFromPageKey: (pageKey: string, voiceOverride: string) => Promise<void>;
  handleStreamSegmentStart: (pageKey: string) => void;
};

const ACTIVE_STREAM_STATUSES = new Set<StreamState['status']>(['connecting', 'streaming', 'paused']);

export function createStreamSequenceController({
  scheduler,
  restartDelayMs = 120
}: {
  scheduler: RestartTimerScheduler;
  restartDelayMs?: number;
}): StreamSequenceController {
  let environment: StreamSequenceEnvironment | null = null;
  let streamSequence: { source: 'page' | 'chapter' | 'paragraph'; baseKey: string } | null = null;
  let lastStreamSource: StreamSource | null = null;
  let sequenceMachine = createStreamSequenceMachineState();
  let streamSequenceActive = false;
  let autoAdvance = false;
  let studyReplayPageKey: string | null = null;
  let studyPausedAtStart = false;
  const lookahead = new StreamLookaheadController<PageText>();
  const restartCoordinator = new StreamRestartCoordinator(scheduler, restartDelayMs);
  const studyReplayGuard = new StreamStudyReplayGuard();

  function getEnvironment() {
    if (!environment) {
      throw new Error('Stream sequence controller requires an environment');
    }
    return environment;
  }

  function transition(event: StreamSequenceMachineEvent) {
    sequenceMachine = transitionStreamSequenceMachine(sequenceMachine, event);
    return sequenceMachine;
  }

  function getPageTextForImage(imageUrl: string) {
    return imageUrl ? getEnvironment().textCache[imageUrl] ?? null : null;
  }

  function getLookaheadEnvironment(): StreamLookaheadEnvironment<PageText> {
    const current = getEnvironment();
    return {
      manifest: current.manifest,
      isRunCurrent: (runId) => isCurrentStreamSequenceRun(sequenceMachine, runId),
      getPageText: (imageUrl) => current.textCache[imageUrl] ?? null,
      getPageSegments: (pageText, imageUrl, pageIndex) => (
        getPageStreamSegments(pageText, imageUrl, pageIndex)
      ),
      getImageUrlFromPageKey: (pageKey) => parseStreamLocator(pageKey)?.imageUrl ?? null,
      enqueue: (segment, voice) => {
        current.enqueueStream({ text: segment.text, pageKey: segment.pageKey, voice });
      }
    };
  }

  function stopStreamSequence(clearPending = false) {
    restartCoordinator.clear();
    transition({ type: 'stop', clearPending });
    autoAdvance = false;
    lastStreamSource = null;
    lookahead.clear();
    streamSequence = null;
    streamSequenceActive = false;
  }

  function resetCurrentSequence() {
    const current = getEnvironment();
    current.stopAudio();
    current.stopStream();
    stopStreamSequence();
  }

  function enqueueChunks(fullText: string, startIndex: number, baseKey: string, voice: string) {
    const current = getEnvironment();
    const chunks = splitStreamChunks(fullText, startIndex);
    for (let index = 1; index < chunks.length; index += 1) {
      current.enqueueStream({ text: chunks[index], pageKey: `${baseKey}#chunk-${index}`, voice });
    }
    return chunks;
  }

  function fillParagraphBuffer(runId: number) {
    lookahead.fillParagraph(runId, getLookaheadEnvironment());
  }

  function fillScrollBuffer(runId: number) {
    lookahead.fillScroll(runId, getLookaheadEnvironment());
  }

  async function startScrollPageSequence(
    imageUrl: string,
    pageText: PageText,
    startBlockId?: string,
    continueAcrossPages = true,
    voiceOverride?: string
  ) {
    const current = getEnvironment();
    const voice = voiceOverride ?? current.streamVoice;
    const imagePageIndex = current.manifest.indexOf(imageUrl);
    const allSegments = getPageStreamSegments(
      pageText,
      imageUrl,
      imagePageIndex >= 0 ? imagePageIndex : null
    );
    if (allSegments.length === 0) {
      current.showToast('No page text available to stream', 'error');
      return;
    }
    const startSegmentIndex = startBlockId
      ? Math.max(0, allSegments.findIndex((segment) => segment.pageKey === `${imageUrl}::${startBlockId}`))
      : 0;
    const segments = allSegments.slice(startSegmentIndex);
    if (segments.length === 0) {
      current.showToast('No page text available to stream', 'error');
      return;
    }
    studyReplayGuard.allowPlayback();

    const replacingPausedStudyStream = studyPausedAtStart && current.streamState.status === 'paused';
    studyPausedAtStart = false;
    if (ACTIVE_STREAM_STATUSES.has(current.streamState.status) && !replacingPausedStudyStream) {
      current.stopStream();
      stopStreamSequence();
    }
    if (replacingPausedStudyStream) {
      current.stopAudio();
      stopStreamSequence();
    } else {
      resetCurrentSequence();
    }
    lastStreamSource = { type: 'page', fullText: pageText.plainText, startIndex: 0, baseKey: imageUrl };
    autoAdvance = false;
    const runId = transition({ type: 'begin' }).runId;
    lookahead.startScroll({
      runId,
      voice,
      nextPageIndex: continueAcrossPages && !current.studyMode
        ? imagePageIndex >= 0 ? imagePageIndex + 1 : current.currentPage + 1
        : current.manifest.length,
      pendingSegments: current.studyMode ? [] : segments.slice(1),
      lastActivePageIndex: segments[0].pageIndex
    });
    streamSequence = { source: 'page', baseKey: imageUrl };
    streamSequenceActive = true;
    const startPromise = current.startStream({
      text: segments[0].text,
      pageKey: segments[0].pageKey,
      voice,
      pauseAtStartOnComplete: current.studyMode,
      replaceCurrent: replacingPausedStudyStream
    });
    fillScrollBuffer(runId);
    await startPromise;
  }

  async function startStreamSequenceFromText(
    fullText: string,
    startIndex: number,
    baseKey: string,
    source: 'page' | 'chapter' | 'paragraph',
    voiceOverride?: string
  ) {
    const current = getEnvironment();
    studyReplayGuard.allowPlayback();
    const voice = voiceOverride ?? current.streamVoice;
    const replacingPausedStudyStream = studyPausedAtStart && current.streamState.status === 'paused';
    studyPausedAtStart = false;
    if (ACTIVE_STREAM_STATUSES.has(current.streamState.status) && !replacingPausedStudyStream) {
      transition({
        type: 'queue-restart',
        reason: voiceOverride ? 'voice-change' : 'replacement',
        pending: { kind: 'sequence', value: { fullText, startIndex, baseKey, source, voiceOverride } }
      });
      current.stopStream();
      stopStreamSequence();
      return;
    }
    const paragraphMode = source === 'chapter' || source === 'paragraph';
    const paragraphSegments = paragraphMode
      ? createParagraphStreamSegments(fullText, startIndex, baseKey)
      : null;
    const chunks = paragraphMode ? null : splitStreamChunks(fullText, startIndex);
    if (paragraphMode && paragraphSegments?.length === 0) {
      current.showToast('No text available to stream', 'error');
      return;
    }
    if (!paragraphMode && (!chunks || chunks.length === 0)) {
      current.showToast('No text available to stream', 'error');
      return;
    }
    if (replacingPausedStudyStream) {
      current.stopAudio();
      stopStreamSequence();
    } else {
      resetCurrentSequence();
    }
    lastStreamSource = { type: source, fullText, startIndex, baseKey };
    autoAdvance = (source === 'page' || source === 'chapter') && current.viewMode !== 'scroll';
    const runId = transition({ type: 'begin' }).runId;
    streamSequence = { source, baseKey };
    streamSequenceActive = true;
    if (paragraphMode && paragraphSegments) {
      lookahead.startParagraph({
        runId,
        voice,
        pendingSegments: current.studyMode ? [] : paragraphSegments.slice(1),
        lastActivePageKey: paragraphSegments[0].pageKey
      });
      const startPromise = current.startStream({
        text: paragraphSegments[0].text,
        pageKey: paragraphSegments[0].pageKey,
        voice,
        pauseAtStartOnComplete: current.studyMode,
        replaceCurrent: replacingPausedStudyStream
      });
      fillParagraphBuffer(runId);
      await startPromise;
      return;
    }
    const textChunks = chunks ?? [];
    const startPromise = current.startStream({
      text: textChunks[0],
      pageKey: `${baseKey}#chunk-0`,
      voice,
      pauseAtStartOnComplete: current.studyMode,
      replaceCurrent: replacingPausedStudyStream
    });
    if (!current.studyMode) {
      enqueueChunks(fullText, startIndex, baseKey, voice);
    }
    await startPromise;
  }

  async function startStreamSequence() {
    const current = getEnvironment();
    if (current.bookType === 'text') {
      if (!current.bookId || current.chapterCount === 0) {
        current.showToast('No chapter available to stream', 'error');
        return;
      }
      if (!current.firstChapterParagraph) {
        current.showToast('No chapter text available to stream', 'error');
        return;
      }
      await startStreamSequenceFromText(
        current.firstChapterParagraph.fullText,
        current.firstChapterParagraph.startIndex,
        current.firstChapterParagraph.key,
        'chapter'
      );
      return;
    }
    const currentImage = current.manifest[current.currentPage] ?? null;
    if (!currentImage) {
      return;
    }
    const pageText = current.textCache[currentImage] ?? null;
    if (!pageText?.plainText) {
      current.showToast('No page text available to stream', 'error');
      return;
    }
    if (current.viewMode === 'scroll') {
      await startScrollPageSequence(currentImage, pageText);
      return;
    }
    await startStreamSequenceFromText(pageText.plainText, 0, currentImage, 'page');
  }

  async function handlePlayChapterParagraph(payload: ChapterParagraph) {
    const current = getEnvironment();
    if (!payload.fullText.trim()) {
      current.showToast('No paragraph text available to stream', 'error');
      return;
    }
    await startStreamSequenceFromText(payload.fullText, payload.startIndex, payload.key, 'paragraph');
  }

  async function handlePlaySingleStream(
    payload: { text: string; pageKey: string },
    voiceOverride?: string
  ) {
    const current = getEnvironment();
    const voice = voiceOverride ?? current.streamVoice;
    const trimmed = stripMarkdown(payload.text).trim();
    if (!trimmed) {
      current.showToast('No text available to stream', 'error');
      return;
    }
    studyReplayGuard.allowPlayback();
    const replacingPausedStudyStream = studyPausedAtStart && current.streamState.status === 'paused';
    studyPausedAtStart = false;
    if (ACTIVE_STREAM_STATUSES.has(current.streamState.status) && !replacingPausedStudyStream) {
      transition({
        type: 'queue-restart',
        reason: voiceOverride ? 'voice-change' : 'replacement',
        pending: {
          kind: 'single',
          value: { text: trimmed, pageKey: payload.pageKey, voiceOverride }
        }
      });
      current.stopStream();
      stopStreamSequence();
      return;
    }
    transition({ type: 'consume-restart' });
    current.stopAudio();
    stopStreamSequence();
    lastStreamSource = { type: 'single', text: trimmed, pageKey: payload.pageKey };
    autoAdvance = false;
    transition({ type: 'begin' });
    await current.startStream({
      text: trimmed,
      pageKey: payload.pageKey,
      voice,
      pauseAtStartOnComplete: current.studyMode,
      replaceCurrent: replacingPausedStudyStream
    });
  }

  async function handlePlayPageBlock(
    payload: { imageUrl: string; startIndex: number; blockId: string },
    voiceOverride?: string
  ) {
    const current = getEnvironment();
    if (!payload.imageUrl) {
      return;
    }
    const pageText = getPageTextForImage(payload.imageUrl);
    if (!pageText?.plainText) {
      current.showToast('No page text available to stream', 'error');
      return;
    }
    await startScrollPageSequence(
      payload.imageUrl,
      pageText,
      payload.blockId,
      current.viewMode === 'scroll',
      voiceOverride
    );
  }

  function handleStopStream() {
    const current = getEnvironment();
    autoAdvance = false;
    studyReplayPageKey = null;
    studyPausedAtStart = false;
    studyReplayGuard.blockUntilIdle();
    current.stopStream();
    stopStreamSequence(true);
  }

  async function restartStreamFromPageKey(pageKey: string, voiceOverride: string) {
    const current = getEnvironment();
    const source = lastStreamSource;
    if (source?.type === 'single' && source.pageKey === pageKey) {
      await handlePlaySingleStream({ text: source.text, pageKey }, voiceOverride);
      return;
    }
    const paragraphMatch = parseParagraphPageKey(pageKey);
    if (paragraphMatch) {
      if (source && (source.type === 'chapter' || source.type === 'paragraph')) {
        await startStreamSequenceFromText(
          source.fullText,
          paragraphMatch.startIndex,
          source.baseKey,
          'paragraph',
          voiceOverride
        );
        return;
      }
      if (current.firstChapterParagraph) {
        await startStreamSequenceFromText(
          current.firstChapterParagraph.fullText,
          paragraphMatch.startIndex,
          current.firstChapterParagraph.key,
          'paragraph',
          voiceOverride
        );
      }
      return;
    }
    const locator = parseStreamLocator(pageKey);
    if (locator?.imageUrl && locator.blockId) {
      await handlePlayPageBlock(
        { imageUrl: locator.imageUrl, startIndex: 0, blockId: locator.blockId },
        voiceOverride
      );
      return;
    }
    if (source?.type === 'page' && (pageKey === source.baseKey || pageKey.startsWith(`${source.baseKey}#chunk-`))) {
      await startStreamSequenceFromText(
        source.fullText,
        source.startIndex,
        source.baseKey,
        'page',
        voiceOverride
      );
    }
  }

  async function handlePlayNextStudyBlock() {
    const current = getEnvironment();
    if (!current.studyMode) {
      return;
    }
    const pageKey = current.streamState.pageKey ?? studyReplayPageKey;
    if (!pageKey) {
      return;
    }
    const paragraphMatch = parseParagraphPageKey(pageKey);
    if (paragraphMatch) {
      const textSource = lastStreamSource &&
        (lastStreamSource.type === 'chapter' || lastStreamSource.type === 'paragraph')
        ? lastStreamSource
        : current.firstChapterParagraph
        ? {
            type: 'paragraph' as const,
            fullText: current.firstChapterParagraph.fullText,
            startIndex: current.firstChapterParagraph.startIndex,
            baseKey: current.firstChapterParagraph.key
          }
        : null;
      if (!textSource) {
        return;
      }
      const segments = createParagraphStreamSegments(
        textSource.fullText,
        textSource.startIndex,
        textSource.baseKey
      );
      const nextSegment = segments.find((segment) => {
        const match = parseParagraphPageKey(segment.pageKey);
        return match ? match.startIndex > paragraphMatch.startIndex : false;
      });
      if (!nextSegment) {
        current.showToast('No next study block', 'info');
        return;
      }
      const nextStartIndex = parseParagraphPageKey(nextSegment.pageKey)?.startIndex ?? textSource.startIndex;
      await startStreamSequenceFromText(
        textSource.fullText,
        nextStartIndex,
        textSource.baseKey,
        'paragraph',
        current.streamVoice
      );
      return;
    }
    const locator = parseStreamLocator(pageKey);
    if (!locator?.imageUrl || !locator.blockId) {
      return;
    }
    const pageText = getPageTextForImage(locator.imageUrl);
    if (!pageText) {
      return;
    }
    const locatorPageIndex = current.manifest.indexOf(locator.imageUrl);
    const segments = getPageStreamSegments(
      pageText,
      locator.imageUrl,
      locatorPageIndex >= 0 ? locatorPageIndex : null
    );
    const currentIndex = segments.findIndex((segment) => segment.pageKey === pageKey);
    const nextSegment = currentIndex >= 0 ? segments[currentIndex + 1] : null;
    const nextLocator = parseStreamLocator(nextSegment?.pageKey ?? null);
    if (!nextSegment || !nextLocator?.blockId) {
      current.showToast('No next study block', 'info');
      return;
    }
    await startScrollPageSequence(
      locator.imageUrl,
      pageText,
      nextLocator.blockId,
      false,
      current.streamVoice
    );
  }

  async function handleToggleStreamPause() {
    const current = getEnvironment();
    if (current.streamState.status === 'paused') {
      if (
        studyPausedAtStart &&
        studyReplayPageKey &&
        current.streamState.pageKey === studyReplayPageKey
      ) {
        await restartStreamFromPageKey(studyReplayPageKey, current.streamVoice);
        return;
      }
      await current.resumeStream();
      return;
    }
    if (current.streamState.status === 'streaming') {
      await current.pauseStream();
    }
  }

  function handleStreamSegmentStart(pageKey: string) {
    lookahead.handleSegmentStart(pageKey, getLookaheadEnvironment());
  }

  function syncRuntime() {
    const current = getEnvironment();
    if (!studyReplayGuard.shouldSync(current.streamState.status)) {
      return;
    }
    if (current.studyMode) {
      lookahead.suppressForStudy(current.manifest.length);
      if (current.streamState.pageKey) {
        studyReplayPageKey = current.streamState.pageKey;
      }
    }

    const scrollRunId = lookahead.scrollRunId;
    if (scrollRunId !== null && !current.studyMode && current.streamState.status !== 'idle') {
      fillScrollBuffer(scrollRunId);
    }

    if (
      current.studyMode &&
      current.streamState.status === 'paused' &&
      current.streamState.playbackSeconds === 0 &&
      current.streamState.pageKey &&
      studyReplayPageKey === current.streamState.pageKey
    ) {
      studyPausedAtStart = true;
      stopStreamSequence();
    }

    if (current.streamState.status !== 'idle') {
      transition({ type: 'stream-active' });
    }

    if (streamSequenceActive && current.streamState.status === 'idle' && !sequenceMachine.startPending) {
      if (!streamSequence) {
        streamSequenceActive = false;
      } else if (current.studyMode) {
        if (studyReplayPageKey) {
          studyPausedAtStart = true;
          current.pauseStreamAtStart(studyReplayPageKey);
        }
        stopStreamSequence();
      } else {
        if (autoAdvance && lastStreamSource &&
          (lastStreamSource.type === 'page' || lastStreamSource.type === 'chapter')) {
          current.requestNextPage();
        }
        autoAdvance = false;
        lastStreamSource = null;
        stopStreamSequence();
      }
    }

    if (
      current.studyMode &&
      !streamSequenceActive &&
      current.streamState.status === 'idle' &&
      !sequenceMachine.pendingRestart &&
      studyReplayPageKey
    ) {
      studyPausedAtStart = true;
      current.pauseStreamAtStart(studyReplayPageKey);
    }

    restartCoordinator.sync({
      getStatus: () => getEnvironment().streamState.status,
      getPending: () => sequenceMachine.pendingRestart,
      consume: () => {
        transition({ type: 'consume-restart' });
      },
      startSequence: (pending) => {
        void startStreamSequenceFromText(
          pending.fullText,
          pending.startIndex,
          pending.baseKey,
          pending.source,
          pending.voiceOverride
        );
      },
      startSingle: (pending) => {
        void handlePlaySingleStream(
          { text: pending.text, pageKey: pending.pageKey },
          pending.voiceOverride
        );
      }
    });
  }

  function updateEnvironment(nextEnvironment: StreamSequenceEnvironment) {
    environment = nextEnvironment;
  }

  function mount() {
    transition({ type: 'mount' });
  }

  function dispose() {
    restartCoordinator.dispose();
    lookahead.clear();
    transition({ type: 'unmount' });
  }

  return {
    updateEnvironment,
    mount,
    dispose,
    syncRuntime,
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleStopStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
    restartStreamFromPageKey,
    handleStreamSegmentStart
  };
}
