import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type FloatingAudioPlaybackState, type FloatingAudioTrack } from '@/components/FloatingAudioPlayer';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import { useAudioController } from '@/hooks/useAudioController';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useModalState } from '@/hooks/useModalState';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useToast } from '@/hooks/useToast';
import { useTocManager } from '@/hooks/useTocManager';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useZoom } from '@/hooks/useZoom';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
import { logStreamHistory, trackEvent } from '@/lib/analytics';
import {
  loadMp3VoiceForBook,
  loadQuizAutoplayForBook,
  saveLastPage,
  saveMp3VoiceForBook,
  saveQuizAutoplayForBook
} from '@/lib/storage';
import { makeStreamLocator, parseStreamLocator } from '@/lib/streamLocator';
import type {
  AppSettings,
  BookSearchResponse,
  ImagePreviewTarget,
  PageTextOcrEngine,
  SearchResult,
  TocEntry
} from '@/types/app';
import type { ToolbarTab } from '@/components/Toolbar';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

type StreamVoice = string;
type StreamVoiceOption = {
  id: string;
  label: string;
  provider: 'openai' | 'xai' | 'yandex' | 'streaming';
};
const PLAYBACK_RATE_OPTIONS = [1, 1.25, 1.5] as const;

const TEXT_FONT_SIZE_OPTIONS = [18, 20, 24, 26, 28, 30, 34];
const TEXT_THEME_OPTIONS = [
  'dark',
  'dracula',
  'obsidian',
  'nord',
  'gruvbox',
  'solarized',
  'light',
  'warm'
] as const;
type TextTheme = (typeof TEXT_THEME_OPTIONS)[number];
const TEXT_FONT_SIZE_MIN = TEXT_FONT_SIZE_OPTIONS[0];
const TEXT_FONT_SIZE_MAX = TEXT_FONT_SIZE_OPTIONS[TEXT_FONT_SIZE_OPTIONS.length - 1];

const DEFAULT_SETTINGS: AppSettings = {
  zoom: 1,
  zoomMode: 'fit-width',
  rotation: 0,
  invert: false,
  brightness: 100,
  contrast: 100,
  dimOutsideBlocks: true,
  dimOutsideBlocksIntensity: 38,
  pan: { x: 0, y: 0 },
  textFontSize: TEXT_FONT_SIZE_OPTIONS[0],
  textTheme: 'dark'
};

function normalizeTextFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.textFontSize;
  }
  let closest = TEXT_FONT_SIZE_OPTIONS[0];
  let smallestDelta = Math.abs(value - closest);
  for (const option of TEXT_FONT_SIZE_OPTIONS) {
    const delta = Math.abs(value - option);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = option;
    }
  }
  return closest;
}

function normalizeTextTheme(value: string): TextTheme {
  if (value === 'slate') {
    return 'dracula';
  }
  return TEXT_THEME_OPTIONS.includes(value as TextTheme) ? (value as TextTheme) : 'dark';
}

function normalizePlaybackRate(value: number): number {
  return PLAYBACK_RATE_OPTIONS.includes(value as (typeof PLAYBACK_RATE_OPTIONS)[number]) ? value : 1;
}

function createDefaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, pan: { ...DEFAULT_SETTINGS.pan } };
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<ToolbarTab>('reading');
  const [mainView, setMainView] = useState<'reader' | 'audio-library'>('reader');
  const [imagePreview, setImagePreview] = useState<ImagePreviewTarget | null>(null);
  const [enhancedImagePreviewUrls, setEnhancedImagePreviewUrls] = useState<Record<string, string>>({});
  const {
    helpOpen,
    openHelp,
    closeHelp,
    listeningDashboardOpen,
    openListeningDashboard,
    closeListeningDashboard,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    jobWorkerOpen,
    openJobWorker,
    closeJobWorker,
    searchOpen,
    setSearchOpen,
    openSearch,
    closeSearch,
    bookCardOpen,
    bookCardBookId,
    openBookCard,
    closeBookCard,
    promptEditorOpen,
    openPromptEditor,
    closePromptEditor,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber
  } = useModalState();
  const [chapterViewRefresh, setChapterViewRefresh] = useState(0);
  const [ocrEditMode, setOcrEditMode] = useState(false);
  const [ocrEditSaving, setOcrEditSaving] = useState(false);
  const ocrEditBaselineRef = useRef<string | null>(null);
  const ocrEditImageRef = useRef<string | null>(null);
  const [firstChapterParagraph, setFirstChapterParagraph] = useState<{
    fullText: string;
    startIndex: number;
    key: string;
  } | null>(null);
  const [streamVoiceOptions, setStreamVoiceOptions] = useState<StreamVoiceOption[]>([]);
  const [defaultStreamVoice, setDefaultStreamVoice] = useState<StreamVoice>('');
  const [streamVoice, setStreamVoice] = useState<StreamVoice>('');
  const [mp3Voice, setMp3Voice] = useState<StreamVoice>('');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quizAutoPlayEnabled, setQuizAutoPlayEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [bookCardRefreshToken, setBookCardRefreshToken] = useState(0);
  const pendingAlignTopRef = useRef(false);
  const lastImageRef = useRef<string | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const shareOpenedTrackedRef = useRef(false);
  const streamHistorySessionRef = useRef<{
    bookId: string;
    chapterNumber: number | null;
    chapterTitle: string | null;
    subchapterTitle: string | null;
    pageNumber: number | null;
    pageKeyStart: string | null;
    startedAt: string;
    lastPageKey: string | null;
  } | null>(null);
  const {
    settings,
    setSettings,
    metrics,
    setMetrics,
    applyZoomMode,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform,
    handleMetricsChange
  } = useZoom(createDefaultSettings());

  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { toast, showToast, dismiss } = useToast();
  const fullscreenControls = useFullscreen(viewerShellRef);
  const { isFullscreen, toggleFullscreen } = fullscreenControls;

  const tocEntriesRef = useRef<React.Dispatch<React.SetStateAction<TocEntry[]>> | null>(null);
  const isStreamVoice = useCallback(
    (value: string): value is StreamVoice => streamVoiceOptions.length === 0 || streamVoiceOptions.some((voice) => voice.id === value),
    [streamVoiceOptions]
  );
  const getDefaultStreamVoice = useCallback(
    () => defaultStreamVoice || streamVoiceOptions[0]?.id || '',
    [defaultStreamVoice, streamVoiceOptions]
  );
  const mp3VoiceOptions = useMemo(
    () => streamVoiceOptions.filter((option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'),
    [streamVoiceOptions]
  );
  const getDefaultMp3Voice = useCallback(
    () => mp3VoiceOptions.find((option) => option.provider === 'streaming')?.id || mp3VoiceOptions[0]?.id || '',
    [mp3VoiceOptions]
  );
  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ defaultVoice?: string; voices?: StreamVoiceOption[] }>('/api/stream-audio/voices')
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const voices = Array.isArray(payload.voices)
          ? payload.voices.filter(
              (voice) =>
                typeof voice.id === 'string' &&
                voice.id.trim() &&
                typeof voice.label === 'string' &&
                (voice.provider === 'openai' ||
                  voice.provider === 'xai' ||
                  voice.provider === 'yandex' ||
                  voice.provider === 'streaming')
            )
          : [];
        const defaultVoice =
          typeof payload.defaultVoice === 'string' && voices.some((voice) => voice.id === payload.defaultVoice)
            ? payload.defaultVoice
            : voices[0]?.id ?? '';
        setStreamVoiceOptions(voices);
        setDefaultStreamVoice(defaultVoice);
        setStreamVoice((previous) => (previous && voices.some((voice) => voice.id === previous) ? previous : defaultVoice));
      })
      .catch((error) => {
        console.error('Unable to load streaming voices', error);
        showToast('Unable to load streaming voices', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);
  const {
    books,
    bookId,
    setBookId,
    manifest,
    bookType,
    chapterCount,
    currentPage,
    setCurrentPage,
    viewMode,
    setViewMode,
    loading,
    bookModalOpen,
    setBookModalOpen,
    uploadingChapter,
    uploadingPdf,
    handleUploadChapter,
    handleCreateChapter,
    handleUploadPdf,
    handleDeleteBook
  } = useBookSession({
    settings,
    setSettings,
    setMetrics,
    showToast,
    setEditorOpen,
    setEditorChapterNumber,
    onUpdateTocEntries: (entries) => tocEntriesRef.current?.(entries),
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    createDefaultSettings
  });
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentImage = manifest[currentPage] ?? null;
  const {
    tocOpen,
    setTocOpen,
    tocManageOpen,
    setTocManageOpen,
    tocEntries,
    setTocEntries,
    detailedTocEntries,
    tocVariant,
    setTocVariant,
    sortedTocEntries,
    sortedDetailedTocEntries,
    tocLoading,
    tocGenerating,
    tocSaving,
    chapterGeneratingIndex,
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager({
    bookId,
    manifestLength: isTextBook ? chapterCount : manifest.length,
    viewMode,
    showToast
  });
  useEffect(() => {
    tocEntriesRef.current = setTocEntries;
  }, [setTocEntries]);
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
  }, [bookId, getDefaultMp3Voice, mp3VoiceOptions]);
  useEffect(() => {
    if (!bookId || !mp3Voice || !mp3VoiceOptions.some((option) => option.id === mp3Voice)) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveMp3VoiceForBook(bookId, mp3Voice);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [bookId, mp3Voice, mp3VoiceOptions]);
  const visibleTocEntries = tocVariant === 'detailed' ? detailedTocEntries : tocEntries;
  const visibleSortedTocEntries =
    tocVariant === 'detailed' ? sortedDetailedTocEntries : sortedTocEntries;
  const currentChapterIndex = useMemo(() => {
    if (isTextBook) {
      return navigationCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [currentPage, isTextBook, navigationCount, sortedTocEntries]);
  const currentChapterEntry = useMemo(() => {
    if (isTextBook) {
      return sortedTocEntries.find((entry) => entry.page === currentPage) ?? null;
    }
    return currentChapterIndex !== null ? sortedTocEntries[currentChapterIndex] : null;
  }, [currentChapterIndex, currentPage, isTextBook, sortedTocEntries]);
  const editorChapterTitle = useMemo(() => {
    if (!editorChapterNumber) {
      return currentChapterEntry?.title ?? null;
    }
    return (
      sortedTocEntries.find((entry) => entry.page === editorChapterNumber - 1)?.title ??
      currentChapterEntry?.title ??
      null
    );
  }, [currentChapterEntry, editorChapterNumber, sortedTocEntries]);
  const nextChapterEntry =
    !isTextBook && currentChapterIndex !== null
      ? sortedTocEntries[currentChapterIndex + 1]
      : null;
  const currentSubchapterEntry = useMemo(() => {
    if (sortedDetailedTocEntries.length === 0) {
      return null;
    }
    const chapterStart = currentChapterEntry?.page ?? 0;
    const chapterEnd = nextChapterEntry?.page ?? manifest.length;
    const candidates = sortedDetailedTocEntries.filter((entry) => {
      if (!Number.isInteger(entry.page)) {
        return false;
      }
      return entry.page >= chapterStart && entry.page <= currentPage && entry.page < chapterEnd;
    });
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }, [currentChapterEntry?.page, currentPage, manifest.length, nextChapterEntry?.page, sortedDetailedTocEntries]);
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
  const chapterRange =
    !isTextBook && currentChapterEntry
      ? { start: currentChapterEntry.page, end: nextChapterEntry?.page ?? manifest.length }
      : null;
  const {
    quizOpen,
    quizLoading,
    quizError,
    quiz,
    openQuiz: handleOpenQuiz,
    regenerateQuiz: handleRegenerateQuiz,
    closeQuiz: handleCloseQuiz
  } = useChapterQuiz({
    bookId,
    chapterNumber,
    chapterRange
  });
  const {
    vocabularyOpen,
    vocabulary,
    vocabularyLoading,
    vocabularyError,
    openVocabulary: handleOpenVocabulary,
    regenerateVocabulary: handleRegenerateVocabulary,
    closeVocabulary: handleCloseVocabulary
  } = useChapterVocabulary({
    bookId,
    chapterNumber,
    chapterRange
  });
  const {
    memoryCardOpen,
    memoryCard,
    memoryCardLoading,
    memoryCardError,
    openMemoryCard: handleOpenMemoryCard,
    regenerateMemoryCard: handleRegenerateMemoryCard,
    closeMemoryCard: handleCloseMemoryCard
  } = useChapterMemoryCard({
    bookId,
    chapterNumber,
    chapterRange
  });
  const hasBooks = books.length > 0;

  const {
    audioState,
    resetAudio,
    resetAudioCache,
    syncFloatingAudioState,
    stopAudio
  } = useAudioController(currentImage);
  const { streamState, startStream, enqueueStream, pauseStream, resumeStream, stopStream } = useStreamingAudio(showToast);
  const [floatingAudio, setFloatingAudio] = useState<FloatingAudioTrack | null>(null);
  const [floatingAudioPlaybackState, setFloatingAudioPlaybackState] = useState<FloatingAudioPlaybackState | 'idle'>(
    'idle'
  );
  const isListening =
    audioState.status === 'playing' ||
    streamState.status === 'streaming' ||
    floatingAudioPlaybackState === 'playing';
  useWakeLock(isListening);
  const {
    closeTextModal,
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    regeneratedText,
    resetTextState,
    savePageText,
    setRegeneratedText,
    textCache,
    textLoading,
    textModalOpen,
    textSaving,
    toggleTextModal,
    updatePageTextBlocks
  } = usePageText(currentImage, showToast);
  const [pageTextOcrEngine, setPageTextOcrEngine] = useState<PageTextOcrEngine>('deepseek_ocr');
  const [displayedChapterText, setDisplayedChapterText] = useState<{
    text: string;
    chapterTitle: string | null;
    versionLabel: string | null;
    versionId: string | null;
  } | null>(null);
  const [chapterVersionNavigationRequest, setChapterVersionNavigationRequest] = useState<{
    id: number;
    chapterNumber: number;
    versionId: string;
  } | null>(null);
  const [autoFollowStream, setAutoFollowStream] = useState(true);
  const [selectedStreamBlockKey, setSelectedStreamBlockKey] = useState<string | null>(null);
  const handlePlayFloatingAudio = useCallback((payload: FloatingAudioTrack) => {
    setFloatingAudio(payload.kind ? payload : { ...payload, kind: 'file' });
    setFloatingAudioPlaybackState('loading');
  }, []);
  const handleCloseFloatingAudio = useCallback(() => {
    if (floatingAudio?.kind === 'page-tts' || floatingAudio?.kind === 'text-tts') {
      stopAudio();
    }
    setFloatingAudio(null);
    setFloatingAudioPlaybackState('idle');
  }, [floatingAudio?.kind, stopAudio]);
  const handleFloatingAudioPlaybackStateChange = useCallback(
    (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => {
      setFloatingAudioPlaybackState(state);
      syncFloatingAudioState(state, track);
    },
    [syncFloatingAudioState]
  );
  useEffect(() => {
    setFloatingAudio(null);
    setFloatingAudioPlaybackState('idle');
  }, [bookId]);
  useEffect(() => {
    setDisplayedChapterText(null);
  }, [bookId, chapterNumber]);
  useEffect(() => {
    if (audioState.status !== 'idle' && audioState.status !== 'error') {
      return;
    }
    if (floatingAudio?.kind === 'page-tts' || floatingAudio?.kind === 'text-tts') {
      setFloatingAudio(null);
      setFloatingAudioPlaybackState('idle');
    }
  }, [audioState.status, floatingAudio]);
  useEffect(() => {
    if (!bookId) {
      setQuizAutoPlayEnabled(true);
      return;
    }
    setQuizAutoPlayEnabled(loadQuizAutoplayForBook(bookId) ?? true);
  }, [bookId]);
  useEffect(() => {
    if (!bookId) {
      return;
    }
    saveQuizAutoplayForBook(bookId, quizAutoPlayEnabled);
  }, [bookId, quizAutoPlayEnabled]);
  useEffect(() => {
    setSelectedStreamBlockKey(null);
  }, [bookId]);
  useEffect(() => {
    if (selectedStreamBlockKey || streamState.status === 'idle' || !streamState.pageKey) {
      return;
    }
    const locator = parseStreamLocator(streamState.pageKey);
    if (locator?.blockId) {
      setSelectedStreamBlockKey(makeStreamLocator(locator.imageUrl, locator.blockId));
    }
  }, [selectedStreamBlockKey, streamState.pageKey, streamState.status]);
  useEffect(() => {
    if (ocrEditImageRef.current === currentImage) {
      return;
    }
    ocrEditImageRef.current = currentImage;
    ocrEditBaselineRef.current = null;
    setOcrEditMode(false);
    setOcrEditSaving(false);
  }, [currentImage]);
  const { renderPage, handlePrev, handleNext, footerMessage } = useNavigation({
    navigationCount,
    currentPage,
    viewMode,
    isTextBook,
    currentChapterIndex,
    sortedTocEntries,
    bookId,
    setCurrentPage,
    setRegeneratedText,
    pendingAlignTopRef,
    resetAudio,
    stopStream,
    currentImage,
    hasBooks,
    chapterNumber,
    currentChapterEntry
  });
  const handleScrollCurrentPageChange = useCallback(
    (pageIndex: number) => {
      setCurrentPage(pageIndex);
      setRegeneratedText(false);
      if (bookId) {
        saveLastPage(bookId, pageIndex);
      }
    },
    [bookId, setCurrentPage, setRegeneratedText]
  );

  const handleStreamSequenceComplete = useCallback(
    (source: 'page' | 'chapter') => {
      if (source !== 'page' || viewMode !== 'pages') {
        handleNext();
        return;
      }
      const nextImage = manifest[currentPage + 1] ?? null;
      if (!nextImage) {
        handleNext();
        return;
      }
      void fetchPageTextByImage(nextImage, { silent: true, updateCurrentState: false }).finally(() => {
        handleNext();
      });
    },
    [currentPage, fetchPageTextByImage, handleNext, manifest, viewMode]
  );
  const {
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleStopStream,
    handleToggleStreamPause,
    restartStreamFromPageKey
  } = useStreamSequence({
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
    onSequenceComplete: handleStreamSequenceComplete
  });
  const selectedStreamLocator = useMemo(() => parseStreamLocator(selectedStreamBlockKey), [selectedStreamBlockKey]);
  const playingStreamLocator = useMemo(
    () => parseStreamLocator(streamState.status === 'streaming' ? streamState.pageKey : null),
    [streamState.pageKey, streamState.status]
  );
  const activeTextParagraph = useMemo(() => {
    if (streamState.status !== 'streaming' || typeof streamState.pageKey !== 'string') {
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
  }, [streamState.pageKey, streamState.status]);
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
  const activeStreamLocator = playingStreamLocator ?? selectedStreamLocator;
  const previousStreamStatusRef = useRef(streamState.status);

  useEffect(() => {
    const session = streamHistorySessionRef.current;
    const previousStatus = previousStreamStatusRef.current;
    const currentStatus = streamState.status;
    const wasActive =
      previousStatus === 'connecting' || previousStatus === 'streaming' || previousStatus === 'paused';
    const isActive = currentStatus === 'connecting' || currentStatus === 'streaming' || currentStatus === 'paused';

    if (!session && isActive && bookId) {
      streamHistorySessionRef.current = {
        bookId,
        chapterNumber,
        chapterTitle: currentChapterEntry?.title ?? null,
        subchapterTitle: currentSubchapterEntry?.title ?? null,
        pageNumber: currentPage,
        pageKeyStart: streamState.pageKey,
        startedAt: new Date().toISOString(),
        lastPageKey: streamState.pageKey
      };
      previousStreamStatusRef.current = currentStatus;
      return;
    }

    if (session && typeof streamState.pageKey === 'string' && streamState.pageKey) {
      session.lastPageKey = streamState.pageKey;
    }
    if (session) {
      session.pageNumber = currentPage;
    }

    if (session && wasActive && !isActive) {
      const listenedSeconds = Math.round(streamState.playbackSeconds * 1000) / 1000;
      if (listenedSeconds >= 1) {
        const endReason =
          currentStatus === 'error'
            ? 'error'
            : currentStatus === 'idle'
              ? 'stopped'
              : 'interrupted';
        logStreamHistory({
          bookId: session.bookId,
          chapterNumber: session.chapterNumber,
          chapterTitle: session.chapterTitle,
          subchapterTitle: session.subchapterTitle,
          pageNumber: session.pageNumber,
          pageKeyStart: session.pageKeyStart,
          pageKeyEnd: session.lastPageKey ?? streamState.pageKey,
          startedAt: session.startedAt,
          endedAt: new Date().toISOString(),
          listenedSeconds,
          endReason
        });
      }
      streamHistorySessionRef.current = null;
    }

    previousStreamStatusRef.current = currentStatus;
  }, [
    bookId,
    chapterNumber,
    currentPage,
    currentChapterEntry,
    currentSubchapterEntry,
    streamState.pageKey,
    streamState.playbackSeconds,
    streamState.status
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const session = streamHistorySessionRef.current;
      if (!session) {
        return;
      }
      const listenedSeconds = Math.round(streamState.playbackSeconds * 1000) / 1000;
      if (listenedSeconds < 1) {
        return;
      }
      logStreamHistory({
        bookId: session.bookId,
        chapterNumber: session.chapterNumber,
        chapterTitle: session.chapterTitle,
        subchapterTitle: session.subchapterTitle,
        pageNumber: session.pageNumber,
        pageKeyStart: session.pageKeyStart,
        pageKeyEnd: session.lastPageKey ?? streamState.pageKey,
        startedAt: session.startedAt,
        endedAt: new Date().toISOString(),
        listenedSeconds,
        endReason: 'unload'
      });
      streamHistorySessionRef.current = null;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [streamState.pageKey, streamState.playbackSeconds]);

  const handleToggleOcrEditMode = useCallback(async () => {
    if (!currentImage || isTextBook) {
      return;
    }

    if (!ocrEditMode) {
      const pageText = currentText ?? (await fetchPageText({ silent: true }));
      if (!pageText || pageText.blocks.length === 0) {
        showToast('No OCR blocks available for editing', 'error');
        return;
      }
      ocrEditBaselineRef.current = pageText.text;
      setOcrEditMode(true);
      showToast('Block edit mode enabled', 'info');
      return;
    }

    const nextText = currentText?.text ?? '';
    const baselineText = ocrEditBaselineRef.current;
    setOcrEditMode(false);

    if (!nextText || nextText === baselineText) {
      ocrEditBaselineRef.current = nextText || baselineText;
      showToast('Block edit mode disabled', 'info');
      return;
    }

    setOcrEditSaving(true);
    const saved = await savePageText(nextText);
    setOcrEditSaving(false);
    if (saved) {
      ocrEditBaselineRef.current = saved.text;
      showToast('Block edits saved', 'success');
      return;
    }
    setOcrEditMode(true);
  }, [currentImage, currentText, fetchPageText, isTextBook, ocrEditMode, savePageText, showToast]);

  const handleToggleSpeechBlock = useCallback(
    async (blockId: string) => {
      if (!currentImage) {
        return;
      }
      const pageText = currentText ?? (await fetchPageText({ silent: true }));
      if (!pageText || pageText.blocks.length === 0) {
        showToast('No OCR blocks available', 'error');
        return;
      }
      const updated = updatePageTextBlocks((blocks) =>
        blocks.map((block) =>
          block.id === blockId ? { ...block, excludedFromSpeech: !block.excludedFromSpeech } : block
        )
      );
      const toggled = updated?.blocks.find((block) => block.id === blockId);
      if (toggled) {
        showToast(toggled.excludedFromSpeech ? 'Block excluded from speech' : 'Block restored to speech', 'info');
      }
    },
    [currentImage, currentText, fetchPageText, showToast, updatePageTextBlocks]
  );

  useEffect(() => {
    if ((viewMode !== 'pages' && viewMode !== 'scroll') || !currentImage || currentText) {
      return;
    }
    void fetchPageText({ silent: true });
  }, [currentImage, currentText, fetchPageText, viewMode]);
  const {
    jobs: ocrJobs,
    paused: ocrPaused,
    progress: ocrProgress,
    enqueuePages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  } = useOcrQueue({ manifest, showToast });
  const {
    closePrintModal,
    createPrintPdf,
    openPrintModal,
    printLoading,
    printModalOpen,
    printOptions,
    selectedPrintOption,
    setPrintSelection
  } = usePrintOptions({ bookId, manifest, currentPage, showToast });
  useEffect(() => {
    if (
      !pendingAlignTopRef.current ||
      !metrics ||
      viewMode !== 'pages' ||
      metrics.naturalHeight === 0 ||
      metrics.scale !== settings.zoom
    ) {
      return;
    }
    const scaledHeight = metrics.naturalHeight * metrics.scale;
    const limitY = Math.max(0, (scaledHeight - metrics.containerHeight) / 2);
    const targetPan = clampPan({ x: 0, y: limitY }, metrics);
    if (settings.pan.x !== targetPan.x || settings.pan.y !== targetPan.y) {
      setSettings((prev) => {
        if (prev.pan.x === targetPan.x && prev.pan.y === targetPan.y) {
          return prev;
        }
        return { ...prev, pan: targetPan };
      });
      return;
    }
    pendingAlignTopRef.current = false;
  }, [metrics, setSettings, settings.pan.x, settings.pan.y, settings.zoom, viewMode]);

  useEffect(() => {
    if (viewMode !== 'pages') {
      lastImageRef.current = currentImage;
      return;
    }
    if (currentImage && lastImageRef.current !== currentImage) {
      pendingAlignTopRef.current = true;
    }
    lastImageRef.current = currentImage;
  }, [currentImage, viewMode]);

  useEffect(() => {
    const normalized = normalizeTextFontSize(settings.textFontSize);
    if (normalized !== settings.textFontSize) {
      setSettings((prev) => {
        if (prev.textFontSize === normalized) {
          return prev;
        }
        return { ...prev, textFontSize: normalized };
      });
    }
  }, [settings.textFontSize, setSettings]);

  useEffect(() => {
    const normalized = normalizeTextTheme(settings.textTheme);
    if (normalized !== settings.textTheme) {
      setSettings((prev) => {
        if (prev.textTheme === normalized) {
          return prev;
        }
        return { ...prev, textTheme: normalized };
      });
    }
  }, [settings.textTheme, setSettings]);
  const handleViewModeChange = useCallback(
    (mode: 'pages' | 'scroll' | 'text' | 'audio') => {
      if (isTextBook && (mode === 'pages' || mode === 'scroll')) {
        return;
      }
      setMainView('reader');
      setViewMode(mode);
    },
    [isTextBook, setViewMode]
  );

  const {
    bookmarks,
    bookmarksLoading,
    bookmarksOpen,
    closeBookmarks,
    handleRemoveBookmarkFromList,
    handleSelectBookmark,
    isBookmarked,
    showBookmarks,
    toggleBookmark
  } = useBookmarks({
    bookId,
    currentImage,
    currentPage,
    renderPage,
    showToast
  });

  useEffect(() => {
    closeBookmarks();
    closeSearch();
    closeBookCard();
    resetTextState();
    resetAudioCache();
    stopAudio();
    stopStream();
    setSearchQuery('');
    setSearchResults([]);
  }, [bookId, closeBookmarks, closeBookCard, closeSearch, resetAudioCache, resetTextState, stopAudio, stopStream]);

  const handleSearch = useCallback(async (query: string) => {
    if (!bookId) {
      showToast('Select a book before searching', 'error');
      return;
    }
    const trimmed = query.trim();
    setSearchQuery(query);
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const result = await fetchJson<BookSearchResponse>(
        `/api/books/${encodeURIComponent(bookId)}/search?q=${encodeURIComponent(trimmed)}&limit=25`
      );
      setSearchResults(Array.isArray(result.results) ? result.results : []);
    } catch (error) {
      console.error(error);
      showToast('Unable to search this book', 'error');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [bookId, showToast]);

  const handleOpenDashboardBook = useCallback(
    (targetBookId: string) => {
      closeListeningDashboard();
      setBookId(targetBookId);
    },
    [closeListeningDashboard, setBookId]
  );

  const handleOpenDashboardChapter = useCallback(
    async (
      targetBookId: string,
      targetChapterNumber: number | null,
      _targetSubchapterTitle?: string | null,
      targetPageNumber?: number | null,
      _targetPageKeyEnd?: string | null
    ) => {
      if (!targetChapterNumber || targetChapterNumber < 1) {
        closeListeningDashboard();
        setBookId(targetBookId);
        return;
      }

      let targetPage = targetChapterNumber - 1;
      try {
        const [manifestResponse, mainResponse] = await Promise.all([
          fetchJson<{ manifest?: string[] }>(`/api/books/${encodeURIComponent(targetBookId)}/manifest`),
          fetchJson<{ toc: TocEntry[] }>(`/api/books/${encodeURIComponent(targetBookId)}/toc`)
        ]);
        const manifestEntries = Array.isArray(manifestResponse.manifest) ? manifestResponse.manifest : [];
        const tocEntries = Array.isArray(mainResponse.toc) ? mainResponse.toc : [];
        const normalizedPageNumber = Number.isInteger(targetPageNumber) ? Number(targetPageNumber) : null;
        if (
          normalizedPageNumber !== null &&
          normalizedPageNumber >= 0 &&
          normalizedPageNumber < manifestEntries.length
        ) {
          targetPage = normalizedPageNumber;
        }
        const tocEntry = tocEntries[targetChapterNumber - 1];
        if (targetPage === targetChapterNumber - 1 && tocEntry && Number.isInteger(tocEntry.page)) {
          targetPage = tocEntry.page;
        }
      } catch (error) {
        console.error(error);
      }

      saveLastPage(targetBookId, targetPage);
      closeListeningDashboard();
      if (bookId === targetBookId) {
        renderPage(targetPage);
        return;
      }
      setBookId(targetBookId);
    },
    [bookId, closeListeningDashboard, renderPage, setBookId]
  );

  const handleSelectSearchResult = useCallback((result: SearchResult) => {
    closeSearch();
    renderPage(result.page);
    setViewMode(isTextBook ? 'text' : viewMode === 'scroll' ? 'scroll' : 'pages');
  }, [closeSearch, isTextBook, renderPage, setViewMode, viewMode]);

  const applyFilters = useCallback(
    (
      filters: Partial<
        Pick<AppSettings, 'brightness' | 'contrast' | 'invert' | 'dimOutsideBlocks' | 'dimOutsideBlocksIntensity'>
      >
    ) => {
      setSettings((prev) => ({
        ...prev,
        ...filters
      }));
    },
    [setSettings]
  );

  const updateTextFontSize = useCallback(
    (value: number) => {
      const clamped = clamp(value, TEXT_FONT_SIZE_MIN, TEXT_FONT_SIZE_MAX);
      const nextSize = normalizeTextFontSize(clamped);
      setSettings((prev) => {
        if (prev.textFontSize === nextSize) {
          return prev;
        }
        return { ...prev, textFontSize: nextSize };
      });
    },
    [setSettings]
  );

  const updateTextTheme = useCallback(
    (value: string) => {
      const nextTheme = normalizeTextTheme(value);
      setSettings((prev) => {
        if (prev.textTheme === nextTheme) {
          return prev;
        }
        return { ...prev, textTheme: nextTheme };
      });
    },
    [setSettings]
  );

  const queueAllPages = useCallback(() => {
    const pages = manifest.map((_, index) => index);
    enqueuePages(pages);
  }, [enqueuePages, manifest]);

  const forceUpdateAllPages = useCallback(() => {
    const pages = manifest.map((_, index) => index);
    enqueuePages(pages, { force: true });
  }, [enqueuePages, manifest]);

  const queueRemainingPages = useCallback(() => {
    const pages = manifest.map((_, index) => index).filter((index) => index >= currentPage);
    enqueuePages(pages);
  }, [currentPage, enqueuePages, manifest]);

  const ocrQueueState = useMemo(
    () => ({
      total: ocrProgress.total,
      processed: ocrProgress.processed,
      failed: ocrProgress.failed,
      running: ocrProgress.running,
      paused: ocrPaused
    }),
    [ocrPaused, ocrProgress]
  );

  useEffect(() => {
    resetQueue();
    closeOcrQueue();
  }, [bookId, closeOcrQueue, resetQueue]);

  const handleCopyText = useCallback(async (overrideText?: string) => {
    if (!overrideText && !currentImage) {
      showToast('No page selected', 'error');
      return;
    }
    const pageText = overrideText ? null : currentText ?? (await fetchPageText());
    const textValue = (overrideText ?? pageText?.text ?? '').trim();
    if (!textValue) {
      showToast('No text available to copy', 'error');
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(textValue);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textValue;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy failed');
        }
      }
      showToast('Copied page text to clipboard', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to copy text', 'error');
    }
  }, [currentImage, currentText, fetchPageText, showToast]);
  const handleCopyVocabulary = useCallback(async (textValue: string) => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      showToast('No vocabulary available to copy', 'error');
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(trimmed);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = trimmed;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy failed');
        }
      }
      showToast('Copied vocabulary to clipboard', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to copy vocabulary', 'error');
    }
  }, [showToast]);
  const handleCopyMemoryCard = useCallback(async (textValue: string) => {
    if (!textValue.trim()) {
      showToast('No memory card available to copy', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(textValue);
      showToast('Copied memory card to clipboard', 'success');
    } catch {
      showToast('Unable to copy memory card', 'error');
    }
  }, [showToast]);

  const handleShareLink = useCallback(async () => {
    if (!bookId || navigationCount === 0) {
      showToast('Select a book before sharing', 'error');
      return;
    }
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('book', bookId);
    shareUrl.searchParams.set('page', String(currentPage + 1));
    shareUrl.searchParams.set('view', viewMode);
    shareUrl.searchParams.set('src', 'share');
    const shareMessage = `Read ${bookId} at page ${currentPage + 1}`;
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'Scanned Book Reader', text: shareMessage, url: shareUrl.toString() });
      } else if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl.toString());
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl.toString();
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) {
          throw new Error('copy failed');
        }
      }
      trackEvent('share_clicked', {
        book: bookId,
        page: currentPage + 1,
        view: viewMode
      });
      showToast('Share link ready', 'success');
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (aborted) {
        return;
      }
      console.error(error);
      showToast('Unable to share link', 'error');
    }
  }, [bookId, currentPage, navigationCount, showToast, viewMode]);

  useEffect(() => {
    if (shareOpenedTrackedRef.current || !bookId || navigationCount === 0) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('src') !== 'share') {
      return;
    }
    shareOpenedTrackedRef.current = true;
    trackEvent('share_opened', {
      book: bookId,
      page: currentPage + 1,
      view: viewMode,
      source: 'share'
    });
  }, [bookId, currentPage, navigationCount, viewMode]);

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
    [mp3VoiceOptions]
  );
  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(normalizePlaybackRate(rate));
  }, []);

  const openBookModal = useCallback(() => setBookModalOpen(true), [setBookModalOpen]);
  const closeBookModal = useCallback(() => setBookModalOpen(false), [setBookModalOpen]);
  const handleOpenAudioLibrary = useCallback(() => {
    setSettingsOpen(false);
    setMainView('audio-library');
  }, []);
  const handleOpenLibraryBook = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      setMainView('reader');
      setViewMode('audio');
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
      }
    },
    [setBookId, setViewMode]
  );
  const handleOpenImagePreview = useCallback(
    (payload: { imageUrl: string; bounds: [number, number, number, number]; caption?: string | null }) => {
      if (!bookId) {
        return;
      }
      const imageFilename = payload.imageUrl.split('/').pop();
      if (!imageFilename) {
        return;
      }
      const [left, top, right, bottom] = payload.bounds;
      const params = new URLSearchParams({
        image: imageFilename,
        left: String(left),
        top: String(top),
        right: String(right),
        bottom: String(bottom)
      });
      const previewKey = `${bookId}:${imageFilename}:${left}:${top}:${right}:${bottom}`;
      setImagePreview({
        bookId,
        imageFilename,
        imageUrl: payload.imageUrl,
        bounds: payload.bounds,
        caption: payload.caption ?? null,
        cropUrl: `/api/books/${encodeURIComponent(bookId)}/image-preview?${params.toString()}`,
        enhancedUrl: enhancedImagePreviewUrls[previewKey] ?? null
      });
    },
    [bookId, enhancedImagePreviewUrls]
  );
  const applyZoomModeWithAlign = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      applyZoomMode(mode);
      if (viewMode === 'pages') {
        pendingAlignTopRef.current = true;
      }
    },
    [applyZoomMode, viewMode]
  );

  const { hotkeys } = useHotkeys({
    viewMode,
    currentImage,
    settings,
    updatePan,
    updateZoom,
    resetTransform,
    applyZoomModeWithAlign,
    updateRotation,
    applyFilters,
    toggleTextModal,
    triggerBackgroundOcr: async () => {
      if (!currentImage || isTextBook) {
        return;
      }
      showToast('Starting OCR…', 'info');
      const pageText = await fetchPageText({ force: true, silent: true, engine: 'deepseek_ocr' });
      if (pageText) {
        showToast('OCR finished', 'success');
      }
    },
    toggleOcrEditMode: handleToggleOcrEditMode,
    setViewMode: handleViewModeChange,
    handlePrev,
    handleNext,
    streamStatus: streamState.status,
    handleStopStream,
    handlePlayStream: handlePlayVisibleStream,
    gotoInputRef,
    toggleFullscreen,
    textModalOpen,
    helpOpen,
    printModalOpen,
    bookmarksOpen,
    searchOpen,
    bookCardOpen,
    bookModalOpen,
    imagePreviewOpen: imagePreview !== null,
    ocrQueueOpen,
    tocOpen,
    tocManageOpen,
    settingsOpen,
    quizOpen,
    vocabularyOpen,
    memoryCardOpen,
    listeningDashboardOpen,
    promptEditorOpen,
    closeTextModal,
    closeBookModal,
    closePrintModal,
    closeBookmarks,
    openSearch,
    closeSearch,
    closeBookCard,
    closePromptEditor,
    setOcrQueueOpen,
    setTocOpen,
    setTocManageOpen,
    setSettingsOpen,
    openHelp,
    closeHelp,
    openBookModal,
    onOpenQuiz: () => {
      setSettingsOpen(false);
      void handleOpenQuiz();
    },
    onOpenVocabulary: () => {
      setSettingsOpen(false);
      void handleOpenVocabulary();
    },
    onOpenMemoryCard: () => {
      setSettingsOpen(false);
      void handleOpenMemoryCard();
    },
    onOpenListeningDashboard: () => {
      setSettingsOpen(false);
      openListeningDashboard();
    }
  });

  const toolbarProps = {
    currentBook: bookId,
    manifestLength: navigationCount,
    currentPage,
    audioLibraryOpen: mainView === 'audio-library',
    viewMode,
    disablePagesMode: isTextBook,
    disableScrollMode: isTextBook,
    disableImageActions: isTextBook,
    onViewModeChange: handleViewModeChange,
    onOpenAudioLibrary: handleOpenAudioLibrary,
    onOpenBookModal: () => {
      setSettingsOpen(false);
      openBookModal();
    },
    onPrev: handlePrev,
    onNext: handleNext,
    onGoTo: (page: number) => renderPage(page),
    onZoomIn: () => updateZoom(settings.zoom + ZOOM_STEP),
    onZoomOut: () => updateZoom(settings.zoom - ZOOM_STEP),
    onResetZoom: resetTransform,
    onFitWidth: () => applyZoomModeWithAlign('fit-width'),
    onFitHeight: () => applyZoomModeWithAlign('fit-height'),
    onRotate: updateRotation,
    onInvert: () => applyFilters({ invert: !settings.invert }),
    invert: settings.invert,
    zoom: settings.zoom,
    rotation: settings.rotation,
    brightness: settings.brightness,
    contrast: settings.contrast,
    dimOutsideBlocks: settings.dimOutsideBlocks,
    dimOutsideBlocksIntensity: settings.dimOutsideBlocksIntensity,
    onBrightness: (value: number) => applyFilters({ brightness: value }),
    onContrast: (value: number) => applyFilters({ contrast: value }),
    onToggleDimOutsideBlocks: () => applyFilters({ dimOutsideBlocks: !settings.dimOutsideBlocks }),
    onDimOutsideBlocksIntensity: (value: number) =>
      applyFilters({ dimOutsideBlocksIntensity: clamp(value, 0, 85) }),
    onToggleTextModal: () => {
      setSettingsOpen(false);
      toggleTextModal();
    },
    onToggleOcrEditMode: () => {
      void handleToggleOcrEditMode();
    },
    ocrEditMode,
    ocrEditSaving,
    onCopyText: handleCopyText,
    onToggleFullscreen: () => void toggleFullscreen(),
    fullscreen: isFullscreen,
    streamState,
    streamVoice,
    streamVoiceOptions,
    onStreamVoiceChange: handleActiveStreamVoiceChange,
    onPlayStream: () => void handlePlayVisibleStream(),
    onStopStream: handleStopStream,
    onCreateChapter: () => {
      if (!isTextBook) {
        showToast('Select a text book to add chapters', 'error');
        return;
      }
      void handleCreateChapter({ bookName: '', chapterTitle: '' });
    },
    onOpenQuiz: () => {
      setSettingsOpen(false);
      void handleOpenQuiz();
    },
    onOpenVocabulary: () => {
      setSettingsOpen(false);
      void handleOpenVocabulary();
    },
    onOpenMemoryCard: () => {
      setSettingsOpen(false);
      void handleOpenMemoryCard();
    },
    quizDisabled: !bookId || !chapterNumber,
    currentChapterLabel: currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : null),
    gotoInputRef,
    onToggleBookmark: toggleBookmark,
    onShowBookmarks: () => {
      setSettingsOpen(false);
      showBookmarks();
    },
    onOpenSearch: openSearch,
    isBookmarked,
    bookmarksCount: bookmarks.length,
    onOpenPrint: () => {
      setSettingsOpen(false);
      openPrintModal();
    },
    onShareLink: () => void handleShareLink(),
    onOpenHelp: () => {
      setSettingsOpen(false);
      openHelp();
    },
    onOpenListeningDashboard: () => {
      setSettingsOpen(false);
      openListeningDashboard();
    },
    onOpenPromptEditor: () => {
      setSettingsOpen(false);
      openPromptEditor();
    },
    onOpenOcrQueue: openOcrQueue,
    onOpenJobWorker: () => {
      setSettingsOpen(false);
      openJobWorker();
    },
    onOpenToc: () => {
      setSettingsOpen(false);
      setTocOpen(true);
    },
    onOpenTocManage: () => {
      setSettingsOpen(false);
      setTocManageOpen(true);
    },
    ocrQueueTotal: ocrQueueState.total,
    ocrQueueProcessed: ocrQueueState.processed,
    ocrQueueFailed: ocrQueueState.failed,
    ocrQueueRunning: ocrQueueState.running,
    ocrQueuePaused: ocrQueueState.paused
  };

  const modalProps = {
    portalTarget: isFullscreen ? modalHostRef.current : null,
    toastProps: { toast, onDismiss: dismiss },
    printModalProps: {
      open: printModalOpen,
      options: printOptions,
      selectedId: selectedPrintOption?.id ?? null,
      onSelect: setPrintSelection,
      onClose: closePrintModal,
      onConfirm: () => void createPrintPdf(),
      loading: printLoading
    },
    bookSelectModalProps: {
      open: bookModalOpen,
      books,
      currentBook: bookId,
      onSelect: (nextBook: string | null) => {
        setSettingsOpen(false);
        setMainView('reader');
        setBookId(nextBook);
        closeBookModal();
      },
      onDelete: handleDeleteBook,
      onUploadChapter: handleUploadChapter,
      uploadingChapter,
      onUploadPdf: handleUploadPdf,
      uploadingPdf,
      onOpenEditCard: openBookCard,
      onOpenAudioLibrary: () => {
        closeBookModal();
        handleOpenAudioLibrary();
      },
      cardRefreshToken: bookCardRefreshToken,
      onClose: closeBookModal
    },
    helpModalProps: { open: helpOpen, hotkeys, onClose: closeHelp },
    bookmarksModalProps: {
      open: bookmarksOpen,
      bookmarks,
      loading: bookmarksLoading,
      currentBook: bookId,
      currentPage,
      onClose: closeBookmarks,
      onSelect: handleSelectBookmark,
      onRemove: handleRemoveBookmarkFromList
    },
    textModalProps: {
      open: textModalOpen,
      text: currentText,
      loading: textLoading,
      onClose: closeTextModal,
      title: currentImage ?? 'Page text',
      ocrEngine: pageTextOcrEngine,
      onOcrEngineChange: setPageTextOcrEngine,
      onRegenerate: (engine: PageTextOcrEngine) => {
        setRegeneratedText(true);
        void fetchPageText({ force: true, engine });
      },
      regenerated: regeneratedText,
      saving: textSaving,
      onSave: (nextText: string) => {
        void savePageText(nextText);
      },
      onCopyText: (textValue: string) => {
        void handleCopyText(textValue);
      }
    },
    tocNavModalProps: {
      open: tocOpen,
      entries: visibleSortedTocEntries,
      variant: tocVariant,
      loading: tocLoading,
      currentPage,
      onClose: () => setTocOpen(false),
      onVariantChange: setTocVariant,
      onGoToPage: (pageIndex: number) => {
        setTocOpen(false);
        renderPage(pageIndex);
      }
    },
    tocModalProps: {
      open: tocManageOpen,
      entries: visibleTocEntries,
      variant: tocVariant,
      loading: tocLoading,
      generating: tocGenerating,
      saving: tocSaving,
      manifestLength: isTextBook ? chapterCount : manifest.length,
      chapterGeneratingIndex,
      allowGenerate: !isTextBook,
      onClose: () => setTocManageOpen(false),
      onVariantChange: setTocVariant,
      onGenerate: handleGenerateToc,
      onSave: handleSaveToc,
      onAddEntry: () => handleAddTocEntry(currentPage, tocVariant),
      onRemoveEntry: (index: number) => handleRemoveTocEntry(index, tocVariant),
      onUpdateEntry: (index: number, next: TocEntry) =>
        handleUpdateTocEntry(index, next, tocVariant),
      onGenerateChapter: handleGenerateChapter
    },
    ocrQueueModalProps: {
      open: ocrQueueOpen,
      onClose: closeOcrQueue,
      jobs: ocrJobs,
      paused: ocrPaused,
      onTogglePause: togglePause,
      onQueueAll: queueAllPages,
      onForceUpdateAll: forceUpdateAllPages,
      onQueueRemaining: queueRemainingPages,
      onRetryFailed: retryFailed,
      onClearQueue: clearQueue
    },
    searchModalProps: {
      open: searchOpen,
      currentBook: bookId,
      currentPage,
      loading: searchLoading,
      query: searchQuery,
      results: searchResults,
      onClose: closeSearch,
      onSearch: (query: string) => {
        void handleSearch(query);
      },
      onQueryChange: setSearchQuery,
      onSelect: handleSelectSearchResult
    },
    bookCardModalProps: {
      open: bookCardOpen,
      bookId: bookCardBookId,
      onClose: closeBookCard,
      onSaved: () => {
        setBookCardRefreshToken((prev) => prev + 1);
      }
    },
    quizModalProps: {
      open: quizOpen,
      loading: quizLoading,
      error: quizError,
      chapterLabel: currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter'),
      quiz,
      streamState,
      autoPlayEnabled: quizAutoPlayEnabled,
      onStreamQuestion: (text: string, questionIndex: number) => {
        const chapterKey = quiz?.chapterNumber ?? chapterNumber ?? 'unknown';
        void handlePlaySingleStream({
          text,
          pageKey: `quiz::chapter-${chapterKey}::question-${questionIndex + 1}`
        });
      },
      onStreamAnswer: (text: string, questionIndex: number) => {
        const chapterKey = quiz?.chapterNumber ?? chapterNumber ?? 'unknown';
        void handlePlaySingleStream({
          text,
          pageKey: `quiz::chapter-${chapterKey}::question-${questionIndex + 1}::answer`
        });
      },
      onStopAudio: handleStopStream,
      onAutoPlayEnabledChange: setQuizAutoPlayEnabled,
      onRegenerate: () => void handleRegenerateQuiz(),
      onClose: () => {
        handleStopStream();
        handleCloseQuiz();
      }
    },
    imagePreviewModalProps: {
      open: imagePreview !== null,
      preview: imagePreview,
      onEnhanced: (url: string) => {
        if (!imagePreview) {
          return;
        }
        const [left, top, right, bottom] = imagePreview.bounds;
        const previewKey = `${imagePreview.bookId}:${imagePreview.imageFilename}:${left}:${top}:${right}:${bottom}`;
        setEnhancedImagePreviewUrls((prev) => {
          if (!url) {
            const next = { ...prev };
            delete next[previewKey];
            return next;
          }
          return { ...prev, [previewKey]: url };
        });
        setImagePreview((current) =>
          current
            ? {
                ...current,
                enhancedUrl: url || null
              }
            : current
        );
      },
      onClose: () => setImagePreview(null)
    },
    vocabularyModalProps: {
      open: vocabularyOpen,
      loading: vocabularyLoading,
      error: vocabularyError,
      chapterLabel: currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter'),
      vocabulary,
      streamState,
      onCopyList: handleCopyVocabulary,
      onPlayAudio: (text: string, chapterNumberValue: number) => {
        void handlePlaySingleStream({
          text,
          pageKey: `vocabulary::chapter-${chapterNumberValue}`
        });
      },
      onStopAudio: handleStopStream,
      onRegenerate: () => void handleRegenerateVocabulary(),
      onClose: handleCloseVocabulary
    },
    memoryCardModalProps: {
      open: memoryCardOpen,
      loading: memoryCardLoading,
      error: memoryCardError,
      chapterLabel: currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter'),
      memoryCard,
      streamState,
      onCopyText: handleCopyMemoryCard,
      onPlayAudio: (text: string, chapterNumberValue: number) => {
        void handlePlaySingleStream({
          text,
          pageKey: `memory-card::chapter-${chapterNumberValue}`
        });
      },
      onStopAudio: handleStopStream,
      onRegenerate: () => void handleRegenerateMemoryCard(),
      onClose: () => {
        handleStopStream();
        handleCloseMemoryCard();
      }
    },
    listeningDashboardModalProps: {
      open: listeningDashboardOpen,
      onOpenBook: handleOpenDashboardBook,
      onOpenChapter: handleOpenDashboardChapter,
      onClose: closeListeningDashboard
    },
    promptEditorModalProps: {
      open: promptEditorOpen,
      onClose: closePromptEditor,
      onChanged: () => {
        setChapterViewRefresh((prev) => prev + 1);
      }
    },
    jobWorkerModalProps: {
      open: jobWorkerOpen,
      onClose: closeJobWorker
    }
  };

  const mainContentProps = {
    viewerShellRef,
    modalHostRef,
    isFullscreen,
    loading,
    mainView,
    viewMode,
    textTheme: settings.textTheme,
    editorOpen,
    footerMessage: mainView === 'audio-library' ? 'MP3 Library' : footerMessage,
    viewerProps: {
      imageUrl: currentImage,
      pageText: currentText,
      editMode: ocrEditMode,
      currentBlockId: activeStreamLocator?.imageUrl === currentImage ? activeStreamLocator.blockId : null,
      playingBlockId: playingStreamLocator?.imageUrl === currentImage ? playingStreamLocator.blockId : null,
      settings,
      onPan: updatePan,
      onZoom: updateZoom,
      onMetricsChange: handleMetricsChange,
      onPlayTextBlock: (payload: { imageUrl: string; startIndex: number; blockId: string }) => {
        setSelectedStreamBlockKey(makeStreamLocator(payload.imageUrl, payload.blockId));
        void handlePlayPageBlock(payload);
      },
      onToggleSpeechBlock: (blockId: string) => {
        void handleToggleSpeechBlock(blockId);
      },
      onOpenImagePreview: handleOpenImagePreview,
      rotation: settings.rotation
    },
    scrollViewerProps: {
      manifest,
      currentPage,
      settings: {
        invert: settings.invert,
        brightness: settings.brightness,
        contrast: settings.contrast
      },
      textCache,
      pageText: currentText,
      editMode: ocrEditMode,
      currentStreamBlockKey:
        activeStreamLocator ? makeStreamLocator(activeStreamLocator.imageUrl, activeStreamLocator.blockId) : null,
      playingStreamBlockKey: streamState.status === 'streaming' ? streamState.pageKey : null,
      dimOutsideBlocks: settings.dimOutsideBlocks,
      dimOutsideBlocksIntensity: settings.dimOutsideBlocksIntensity,
      streamPageKey: streamState.status === 'streaming' ? streamState.pageKey : null,
      autoFollowEnabled: autoFollowStream,
      fetchPageTextByImage,
      onPlayTextBlock: (payload: { imageUrl: string; startIndex: number; blockId: string }) => {
        setSelectedStreamBlockKey(makeStreamLocator(payload.imageUrl, payload.blockId));
        void handlePlayPageBlock(payload);
      },
      onToggleSpeechBlock: (blockId: string) => {
        void handleToggleSpeechBlock(blockId);
      },
      onOpenImagePreview: handleOpenImagePreview,
      onCurrentPageChange: handleScrollCurrentPageChange
    },
    chapterEditorProps: {
      bookId,
      chapterNumber: editorChapterNumber ?? chapterNumber,
      chapterTitle: editorChapterTitle,
      onClose: () => {
        setEditorOpen(false);
        setEditorChapterNumber(null);
      },
      onSaved: (nextToc: TocEntry[] | null) => {
        if (nextToc) {
          setTocEntries(nextToc);
        }
        setEditorOpen(false);
        setEditorChapterNumber(null);
        setChapterViewRefresh((prev) => prev + 1);
      }
    },
    chapterViewerProps: {
      bookId,
      chapterNumber,
      chapterTitle: currentChapterEntry?.title ?? null,
      pageRange: chapterRange,
      tocLoading,
      allowGenerate: !isTextBook,
      allowEdit: isTextBook,
      onEditChapter: () => {
        setEditorChapterNumber(chapterNumber);
        setEditorOpen(true);
      },
      textFontSize: settings.textFontSize,
      onTextFontSizeChange: updateTextFontSize,
      textTheme: settings.textTheme,
      onTextThemeChange: updateTextTheme,
      mp3Voice,
      mp3VoiceOptions,
      onMp3VoiceChange: handleMp3VoiceChange,
      refreshToken: chapterViewRefresh,
      versionNavigationRequest: chapterVersionNavigationRequest,
      onOpenAudioView: () => {
        setChapterVersionNavigationRequest(null);
        setViewMode('audio');
      },
      onDisplayedTextChange: setDisplayedChapterText,
      onFirstParagraphReady: setFirstChapterParagraph,
      onPlayParagraph: handlePlayChapterParagraph,
      onPlayAudio: handlePlayFloatingAudio,
      playingParagraphStart: activeTextParagraph.startIndex,
      playingParagraphMode: activeTextParagraph.mode
    },
    audioLibraryViewProps: {
      onPlayAudio: handlePlayFloatingAudio,
      onOpenBook: handleOpenLibraryBook,
      showToast
    },
    audioViewProps: {
      bookId,
      tocEntries: sortedTocEntries,
      tocLoading,
      mp3Voice,
      mp3VoiceOptions,
      onMp3VoiceChange: handleMp3VoiceChange,
      showToast,
      onOpenChapterText: (pageIndex: number, versionId?: string, targetChapterNumber?: number) => {
        if (versionId && targetChapterNumber) {
          setChapterVersionNavigationRequest((current) => ({
            id: (current?.id ?? 0) + 1,
            chapterNumber: targetChapterNumber,
            versionId
          }));
        } else {
          setChapterVersionNavigationRequest(null);
        }
        setViewMode('text');
        renderPage(pageIndex);
      },
      onPlayAudio: handlePlayFloatingAudio
    },
    streamBubbleProps: {
      streamState,
      streamVoice,
      streamVoiceOptions,
      onStreamVoiceChange: handleActiveStreamVoiceChange,
      showAutoFollow: viewMode === 'scroll',
      autoFollowEnabled: autoFollowStream,
      onToggleAutoFollow: () => setAutoFollowStream((prev) => !prev),
      onTogglePause: () => void handleToggleStreamPause(),
      onStopStream: handleStopStream
    },
    floatingAudioPlayerProps: {
      track: floatingAudio,
      playbackRate,
      playbackRateOptions: PLAYBACK_RATE_OPTIONS,
      onPlaybackRateChange: handlePlaybackRateChange,
      onClose: handleCloseFloatingAudio,
      onPlaybackStateChange: handleFloatingAudioPlaybackStateChange
    },
    onOpenSettings: () => setSettingsOpen(true)
  };

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderMainContent {...mainContentProps} />
      <ReaderModalLayer
        {...modalProps}
        settingsModalProps={{
          open: settingsOpen,
          toolbarProps: {
            ...toolbarProps,
            activeTab: settingsTab,
            onTabChange: setSettingsTab,
            onViewModeChange: (mode) => {
              handleViewModeChange(mode);
              setSettingsOpen(false);
            }
          },
          onClose: () => setSettingsOpen(false)
        }}
      />
    </div>
  );
}
