import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReaderMainContent from '@/components/ReaderMainContent';
import ReaderModalLayer from '@/components/ReaderModalLayer';
import ReaderSidebar from '@/components/ReaderSidebar';
import { useAudioController } from '@/hooks/useAudioController';
import { useBookSession } from '@/hooks/useBookSession';
import { useBookmarks } from '@/hooks/useBookmarks';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useChapterVocabulary } from '@/hooks/useChapterVocabulary';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import { useModalState } from '@/hooks/useModalState';
import { useNavigation } from '@/hooks/useNavigation';
import { usePageText } from '@/hooks/usePageText';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { usePrintOptions } from '@/hooks/usePrintOptions';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useMp3Voice, useStreamVoices } from '@/hooks/useStreamVoices';
import { useUnitsRouteState, useUnitsRouteSync } from '@/hooks/useUnitsRoute';
import { useStreamHistoryLogger } from '@/hooks/useStreamHistoryLogger';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useShareLink } from '@/hooks/useShareLink';
import { useBookSearch } from '@/hooks/useBookSearch';
import { useFloatingAudio } from '@/hooks/useFloatingAudio';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useToast } from '@/hooks/useToast';
import { useTocManager } from '@/hooks/useTocManager';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useZoom } from '@/hooks/useZoom';
import { ZOOM_STEP } from '@/lib/hotkeys';
import { clamp, clampPan } from '@/lib/math';
import { trackEvent } from '@/lib/analytics';
import {
  loadQuizAutoplayForBook,
  saveLastPage,
  saveQuizAutoplayForBook
} from '@/lib/storage';
import { makeStreamLocator, parseStreamLocator } from '@/lib/streamLocator';
import { fetchJson } from '@/lib/fetchJson';
import { copyToClipboard } from '@/lib/clipboard';
import {
  PLAYBACK_RATE_OPTIONS,
  TEXT_FONT_SIZE_MIN,
  TEXT_FONT_SIZE_MAX,
  createDefaultSettings,
  getMainViewFromLocation,
  normalizePlaybackRate,
  normalizeTextFontSize,
  normalizeTextTheme,
  type MainView
} from '@/lib/appConstants';
import type {
  AppSettings,
  ImagePreviewTarget,
  PageTextOcrEngine,
  SearchResult,
  TocEntry,
  UnitSet
} from '@/types/app';
import type { ToolbarTab } from '@/components/Toolbar';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<ToolbarTab>('image');
  const {
    mainView,
    setMainView,
    selectedUnitSetId,
    setSelectedUnitSetId,
    selectedUnitTopicId,
    setSelectedUnitTopicId
  } = useUnitsRouteState();
  const [unitQuizLabel, setUnitQuizLabel] = useState('Topic');
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
  const [editorTextVersion, setEditorTextVersion] = useState<{
    versionId: string;
    versionLabel: string | null;
    text: string;
  } | null>(null);
  const [unitsRefreshToken, setUnitsRefreshToken] = useState(0);
  const [unitCreating, setUnitCreating] = useState(false);
  const [firstChapterParagraph, setFirstChapterParagraph] = useState<{
    fullText: string;
    startIndex: number;
    key: string;
  } | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quizAutoPlayEnabled, setQuizAutoPlayEnabled] = useState(true);
  const [bookCardRefreshToken, setBookCardRefreshToken] = useState(0);
  const pendingAlignTopRef = useRef(false);
  const lastImageRef = useRef<string | null>(null);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
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
  const {
    streamVoiceOptions,
    streamVoice,
    setStreamVoice,
    isStreamVoice,
    getDefaultStreamVoice,
    mp3VoiceOptions,
    getDefaultMp3Voice
  } = useStreamVoices({ showToast });
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
    deletingChapter,
    uploadingPdf,
    handleUploadChapter,
    handleCreateChapter,
    handleUploadPdf,
    handleDeleteBook,
    handleDeleteChapter
  } = useBookSession({
    settings,
    setSettings,
    setMetrics,
    urlSyncPaused: mainView === 'units',
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

  useUnitsRouteSync({
    mainView,
    setMainView,
    selectedUnitSetId,
    setSelectedUnitSetId,
    selectedUnitTopicId,
    setSelectedUnitTopicId,
    viewMode
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
  const { mp3Voice, setMp3Voice } = useMp3Voice({ bookId, mp3VoiceOptions, getDefaultMp3Voice });
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
    quizOpen: unitQuizOpen,
    quizLoading: unitQuizLoading,
    quizError: unitQuizError,
    quiz: unitQuiz,
    openQuiz: handleOpenUnitTopicQuiz,
    regenerateQuiz: handleRegenerateUnitTopicQuiz,
    closeQuiz: handleCloseUnitTopicQuiz
  } = useUnitTopicQuiz({
    unitSetId: selectedUnitSetId,
    topicId: selectedUnitTopicId
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
  const {
    streamState,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream,
    stopAfterCurrentStream,
    pauseStreamAtStart
  } = useStreamingAudio(showToast);
  const {
    floatingAudio,
    floatingAudioPlaybackState,
    playFloatingAudio: handlePlayFloatingAudio,
    closeFloatingAudio: handleCloseFloatingAudio,
    handlePlaybackStateChange: handleFloatingAudioPlaybackStateChange
  } = useFloatingAudio({ bookId, audioState, stopAudio, syncFloatingAudioState });
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
  useEffect(() => {
    setDisplayedChapterText(null);
  }, [bookId, chapterNumber]);
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
    handlePlayNextStudyBlock,
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
    pauseStreamAtStart,
    stopAudio,
    streamVoice,
    studyMode: settings.studyMode,
    onSequenceComplete: handleStreamSequenceComplete
  });
  const selectedStreamLocator = useMemo(() => parseStreamLocator(selectedStreamBlockKey), [selectedStreamBlockKey]);
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';
  const playingStreamLocator = useMemo(
    () => parseStreamLocator(streamPositionActive ? streamState.pageKey : null),
    [streamPositionActive, streamState.pageKey]
  );
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
  const activeStreamLocator = playingStreamLocator ?? selectedStreamLocator;

  useStreamHistoryLogger({
    bookId,
    chapterNumber,
    currentChapterEntry,
    currentSubchapterEntry,
    currentPage,
    streamState
  });

  const {
    ocrEditMode,
    ocrEditSaving,
    toggleOcrEditMode: handleToggleOcrEditMode,
    toggleSpeechBlock: handleToggleSpeechBlock
  } = useOcrEditMode({
    currentImage,
    currentText,
    isTextBook,
    fetchPageText,
    savePageText,
    updatePageTextBlocks,
    showToast
  });

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
  }, [bookId, closeBookmarks, closeBookCard, closeSearch, resetAudioCache, resetTextState, stopAudio, stopStream]);

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    runSearch: handleSearch
  } = useBookSearch({ bookId, showToast });

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

  const handleOpenDashboardUnit = useCallback(
    (unitSetId: string, topicId: string) => {
      closeListeningDashboard();
      setMainView('units');
      setSelectedUnitSetId(unitSetId);
      setSelectedUnitTopicId(topicId);
    },
    [closeListeningDashboard]
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

  const toggleStudyMode = useCallback(() => {
    const enablingStudyMode = !settings.studyMode;
    setSettings((prev) => ({ ...prev, studyMode: !prev.studyMode }));
    if (
      enablingStudyMode &&
      (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused')
    ) {
      stopAfterCurrentStream();
    }
  }, [setSettings, settings.studyMode, stopAfterCurrentStream, streamState.status]);

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
    const copied = await copyToClipboard(textValue);
    showToast(copied ? 'Copied page text to clipboard' : 'Unable to copy text', copied ? 'success' : 'error');
  }, [currentImage, currentText, fetchPageText, showToast]);
  const handleCopyVocabulary = useCallback(async (textValue: string) => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      showToast('No vocabulary available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(trimmed);
    showToast(copied ? 'Copied vocabulary to clipboard' : 'Unable to copy vocabulary', copied ? 'success' : 'error');
  }, [showToast]);
  const handleCopyMemoryCard = useCallback(async (textValue: string) => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      showToast('No memory card available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(trimmed);
    showToast(copied ? 'Copied memory card to clipboard' : 'Unable to copy memory card', copied ? 'success' : 'error');
  }, [showToast]);

  const { shareLink: handleShareLink } = useShareLink({
    bookId,
    currentPage,
    navigationCount,
    viewMode,
    showToast
  });

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
  const handleOpenUnits = useCallback(() => {
    setSettingsOpen(false);
    setSelectedUnitSetId(null);
    setSelectedUnitTopicId(null);
    setMainView('units');
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
  const handleOpenUnitSource = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      setSelectedUnitSetId(null);
      setSelectedUnitTopicId(null);
      setMainView('reader');
      setViewMode('text');
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
        if (bookId === targetBookId) {
          renderPage(targetChapterNumber - 1);
        }
      }
    },
    [bookId, renderPage, setBookId, setViewMode]
  );
  const handleCreateUnit = useCallback(
    async (payload: {
      text: string;
      chapterTitle: string | null;
      versionLabel: string | null;
      versionId: string | null;
    }) => {
      if (!bookId || !chapterNumber) {
        showToast('Select a chapter before creating units', 'error');
        return;
      }
      const content = payload.text.trim();
      if (!content) {
        showToast('No visible chapter text available for units', 'error');
        return;
      }
      setUnitCreating(true);
      try {
        const result = await fetchJson<{ item: UnitSet }>('/api/units', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sourceBookId: bookId,
            sourceChapterNumber: chapterNumber,
            sourceChapterTitle: payload.chapterTitle ?? currentChapterEntry?.title ?? null,
            sourceVersionId: payload.versionId ?? payload.versionLabel ?? null,
            content
          })
        });
        setUnitsRefreshToken((prev) => prev + 1);
        setSelectedUnitSetId(result.item.id);
        setSelectedUnitTopicId(null);
        setSettingsOpen(false);
        setMainView('units');
        showToast('Unit created', 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to create unit', 'error');
      } finally {
        setUnitCreating(false);
      }
    },
    [bookId, chapterNumber, currentChapterEntry?.title, showToast]
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
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
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
      if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
        void handleOpenUnitTopicQuiz();
        return;
      }
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

  const sidebarProps = {
    currentBook: bookId,
    manifestLength: navigationCount,
    currentPage,
    audioLibraryOpen: mainView === 'audio-library',
    unitsLibraryOpen: mainView === 'units',
    viewMode,
    disablePagesMode: isTextBook,
    disableScrollMode: isTextBook,
    disableImageActions: isTextBook,
    onViewModeChange: handleViewModeChange,
    onOpenAudioLibrary: handleOpenAudioLibrary,
    onOpenUnits: handleOpenUnits,
    onOpenBookModal: () => {
      setSettingsOpen(false);
      openBookModal();
    },
    onPrev: handlePrev,
    onNext: handleNext,
    onGoTo: (page: number) => renderPage(page),
    streamState,
    streamVoice,
    streamVoiceOptions,
    onStreamVoiceChange: handleActiveStreamVoiceChange,
    onPlayStream: () => void handlePlayVisibleStream(),
    onStopStream: handleStopStream,
    onToggleBookmark: toggleBookmark,
    onShowBookmarks: () => {
      setSettingsOpen(false);
      showBookmarks();
    },
    onOpenSearch: openSearch,
    isBookmarked,
    bookmarksCount: bookmarks.length,
    onOpenToc: () => {
      setSettingsOpen(false);
      setTocOpen(true);
    },
    onOpenListeningDashboard: () => {
      setSettingsOpen(false);
      openListeningDashboard();
    }
  };

  const settingsToolbarProps = {
    currentBook: bookId,
    manifestLength: navigationCount,
    viewMode,
    disableImageActions: isTextBook,
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
    onCreateChapter: () => {
      if (!isTextBook) {
        showToast('Select a text book to add chapters', 'error');
        return;
      }
      void handleCreateChapter({ bookName: '', chapterTitle: '' });
    },
    onOpenQuiz: () => {
      setSettingsOpen(false);
      if (mainView === 'units' && selectedUnitSetId && selectedUnitTopicId) {
        void handleOpenUnitTopicQuiz();
        return;
      }
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
    onOpenPrint: () => {
      setSettingsOpen(false);
      openPrintModal();
    },
    onShareLink: () => void handleShareLink(),
    onOpenHelp: () => {
      setSettingsOpen(false);
      openHelp();
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
      open: quizOpen || unitQuizOpen,
      loading: unitQuizOpen ? unitQuizLoading : quizLoading,
      error: unitQuizOpen ? unitQuizError : quizError,
      contextLabel: unitQuizOpen
        ? unitQuizLabel
        : currentChapterEntry?.title ?? (chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter'),
      quiz: unitQuizOpen ? unitQuiz : quiz,
      streamState,
      autoPlayEnabled: quizAutoPlayEnabled,
      onStreamQuestion: (text: string, questionIndex: number) => {
        const contextKey = (unitQuizOpen ? unitQuiz : quiz)?.contextKey ?? `quiz::chapter-${chapterNumber ?? 'unknown'}`;
        void handlePlaySingleStream({
          text,
          pageKey: `${contextKey}::question-${questionIndex + 1}`
        });
      },
      onStreamAnswer: (text: string, questionIndex: number) => {
        const contextKey = (unitQuizOpen ? unitQuiz : quiz)?.contextKey ?? `quiz::chapter-${chapterNumber ?? 'unknown'}`;
        void handlePlaySingleStream({
          text,
          pageKey: `${contextKey}::question-${questionIndex + 1}::answer`
        });
      },
      onStopAudio: handleStopStream,
      onAutoPlayEnabledChange: setQuizAutoPlayEnabled,
      onRegenerate: () => {
        if (unitQuizOpen) {
          void handleRegenerateUnitTopicQuiz().then(() => setUnitsRefreshToken((prev) => prev + 1));
          return;
        }
        void handleRegenerateQuiz();
      },
      onClose: () => {
        handleStopStream();
        if (unitQuizOpen) {
          handleCloseUnitTopicQuiz();
          return;
        }
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
      onOpenUnit: handleOpenDashboardUnit,
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
    footerMessage: mainView === 'audio-library' ? 'MP3 Library' : mainView === 'units' ? 'Units' : footerMessage,
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
      playingStreamBlockKey: streamPositionActive ? streamState.pageKey : null,
      dimOutsideBlocks: settings.dimOutsideBlocks,
      dimOutsideBlocksIntensity: settings.dimOutsideBlocksIntensity,
      streamPageKey: streamPositionActive ? streamState.pageKey : null,
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
      versionId: editorTextVersion?.versionId ?? null,
      versionLabel: editorTextVersion?.versionLabel ?? null,
      initialText: editorTextVersion?.text ?? null,
      onClose: () => {
        setEditorOpen(false);
        setEditorChapterNumber(null);
        setEditorTextVersion(null);
      },
      onSaved: (nextToc: TocEntry[] | null) => {
        if (nextToc) {
          setTocEntries(nextToc);
        }
        setEditorOpen(false);
        setEditorChapterNumber(null);
        setEditorTextVersion(null);
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
      allowEdit: true,
      chapterDeleting: deletingChapter,
      onEditChapter: (payload: { versionId: string; versionLabel: string | null; text: string }) => {
        setEditorChapterNumber(chapterNumber);
        setEditorTextVersion(payload);
        setEditorOpen(true);
      },
      onDeleteChapter: isTextBook ? handleDeleteChapter : undefined,
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
      onCreateUnit: handleCreateUnit,
      unitCreating,
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
      showToast,
      textFontSize: settings.textFontSize,
      onTextFontSizeChange: updateTextFontSize,
      textTheme: settings.textTheme,
      onTextThemeChange: updateTextTheme
    },
    unitsViewProps: {
      refreshToken: unitsRefreshToken,
      selectedSetId: selectedUnitSetId,
      selectedTopicId: selectedUnitTopicId,
      onSelectSet: (unitSetId: string | null) => {
        setSelectedUnitSetId(unitSetId);
        setSelectedUnitTopicId(null);
      },
      onSelectTopic: setSelectedUnitTopicId,
      streamState,
      onPlayTopicParagraph: handlePlayChapterParagraph,
      onStopAudio: handleStopStream,
      showToast,
      onOpenSource: handleOpenUnitSource,
      onOpenTopicQuiz: ({ label }: { unitSetId: string; topicId: string; label: string }) => {
        setUnitQuizLabel(label);
        void handleOpenUnitTopicQuiz().then(() => setUnitsRefreshToken((prev) => prev + 1));
      }
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
      studyMode: settings.studyMode,
      onToggleStudyMode: toggleStudyMode,
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
    }
  };

  return (
    <div className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''}`}>
      <ReaderSidebar
        {...sidebarProps}
        mainView={mainView}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <ReaderMainContent {...mainContentProps} />
      <ReaderModalLayer
        {...modalProps}
        settingsModalProps={{
          open: settingsOpen,
          toolbarProps: {
            ...settingsToolbarProps,
            activeTab: settingsTab,
            onTabChange: setSettingsTab
          },
          onClose: () => setSettingsOpen(false)
        }}
      />
    </div>
  );
}
