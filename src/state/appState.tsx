import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode
} from 'react';
import {
  createDefaultSettings,
  type MainView,
  type StreamVoice,
  type StreamVoiceOption,
  type ViewMode
} from '@/lib/appConstants';
import type {
  AppSettings,
  AudioState,
  Bookmark,
  ChapterMemoryCard,
  ChapterVocabulary,
  ImagePreviewTarget,
  PageText,
  PageTextOcrEngine,
  Quiz,
  SearchResult,
  TocEntry,
  ToastMessage,
  ViewerMetrics
} from '@/types/app';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';

export type AppToolbarTab = 'image' | 'study' | 'tools';
export type TocVariant = 'main' | 'detailed';
export type QuizModal = 'chapterQuiz' | 'unitQuiz';

export type SimpleModal =
  | 'help'
  | 'listeningDashboard'
  | 'ocrQueue'
  | 'jobWorker'
  | 'search'
  | 'promptEditor'
  | 'settings'
  | 'tocNav'
  | 'tocManage'
  | 'text'
  | 'print'
  | 'bookmarks'
  | 'chapterQuiz'
  | 'unitQuiz'
  | 'vocabulary'
  | 'memoryCard'
  | 'bookSelect';

export interface AppUiState {
  modals: Record<SimpleModal, boolean> & {
    bookCard: boolean;
  };
  fullscreen: boolean;
  toast: ToastMessage | null;
  bookCardBookId: string | null;
  imagePreview: ImagePreviewTarget | null;
  editor: {
    open: boolean;
    chapterNumber: number | null;
    textVersion: ChapterEditorTextVersion | null;
  };
  settingsToolbar: {
    activeTab: AppToolbarTab;
  };
}

export interface AppNavigationState {
  mainView: MainView;
  selectedUnitSetId: string | null;
  selectedUnitTopicId: string | null;
}

export type PageNavigationRequest = {
  id: number;
} & (
  | { kind: 'page'; pageIndex: number }
  | { kind: 'previous' }
  | { kind: 'next' }
);

export type DashboardNavigationRequest = {
  id: number;
} & (
  | { kind: 'dashboardBook'; bookId: string }
  | {
      kind: 'dashboardChapter';
      bookId: string;
      chapterNumber: number | null;
      subchapterTitle?: string | null;
      pageNumber?: number | null;
      pageKeyEnd?: string | null;
    }
  | { kind: 'dashboardUnit'; unitSetId: string; topicId: string }
  | { kind: 'audioLibraryBook'; bookId: string; chapterNumber: number }
  | { kind: 'unitSource'; bookId: string; chapterNumber: number }
);

export type StreamControlRequest = {
  id: number;
} & (
  | { kind: 'playVisible' }
  | { kind: 'stop' }
  | { kind: 'togglePause' }
  | { kind: 'setVoice'; voice: string }
);

export interface ReaderSessionState {
  bookId: string | null;
  currentPage: number;
  viewMode: ViewMode;
}

export interface BookSessionWorkflowState {
  books: string[];
  manifest: string[];
  bookType: 'image' | 'text';
  chapterCount: number;
  loading: boolean;
  uploadingChapter: boolean;
  deletingChapter: boolean;
  uploadingPdf: boolean;
  libraryStateReady: boolean;
}

export interface ChapterEditorTextVersion {
  versionId: string;
  versionLabel: string | null;
  text: string;
}

export interface ChapterVersionNavigationRequest {
  id: number;
  chapterNumber: number;
  versionId: string;
}

export interface DisplayedChapterText {
  text: string;
  chapterTitle: string | null;
  versionLabel: string | null;
  versionId: string | null;
}

export interface ChapterParagraph {
  fullText: string;
  startIndex: number;
  key: string;
}

export interface ChapterTextContextState {
  displayedChapterText: DisplayedChapterText | null;
  firstChapterParagraph: ChapterParagraph | null;
}

export interface AppRefreshTokens {
  chapterView: number;
  bookCards: number;
}

export interface ReaderPreferencesState {
  pageTextOcrEngine: PageTextOcrEngine;
  quizAutoPlayEnabled: boolean;
}

export interface StreamUiControlsState {
  autoFollowStream: boolean;
  selectedStreamBlockKey: string | null;
  playbackRate: number;
}

export interface UnitWorkflowState {
  refreshToken: number;
  quizLabel: string;
  creating: boolean;
}

export interface OcrEditState {
  editMode: boolean;
  saving: boolean;
}

export interface FloatingAudioState {
  track: FloatingAudioTrack | null;
  playbackState: FloatingAudioPlaybackState | 'idle';
}

export interface PrintWorkflowState {
  selection: string;
  loading: boolean;
}

export interface TocWorkflowState {
  variant: TocVariant;
  entries: TocEntry[];
  detailedEntries: TocEntry[];
  loading: boolean;
  generating: boolean;
  saving: boolean;
  chapterGeneratingIndex: number | null;
}

export interface SearchWorkflowState {
  query: string;
  results: SearchResult[];
  loading: boolean;
}

export interface BookmarkWorkflowState {
  items: Bookmark[];
  loading: boolean;
}

export interface QuizWorkflowEntry {
  loading: boolean;
  error: string | null;
  quiz: Quiz | null;
}

export type QuizWorkflowState = Record<QuizModal, QuizWorkflowEntry>;

export interface VocabularyWorkflowState {
  loading: boolean;
  error: string | null;
  vocabulary: ChapterVocabulary | null;
}

export interface MemoryCardWorkflowState {
  loading: boolean;
  error: string | null;
  memoryCard: ChapterMemoryCard | null;
}

export interface PageTextWorkflowState {
  cache: Record<string, PageText>;
  loading: boolean;
  saving: boolean;
  regenerated: boolean;
}

export interface ImagePreviewWorkflowState {
  enhancedUrls: Record<string, string>;
  enhancing: boolean;
  error: string | null;
}

export interface ViewerWorkflowState {
  settings: AppSettings;
  metrics: ViewerMetrics | null;
}

export interface VoiceWorkflowState {
  streamVoiceOptions: StreamVoiceOption[];
  defaultStreamVoice: StreamVoice;
  streamVoice: StreamVoice;
  mp3Voice: StreamVoice;
}

export interface CentralAppState {
  ui: AppUiState;
  navigation: AppNavigationState;
  pageNavigationRequest: PageNavigationRequest | null;
  dashboardNavigationRequest: DashboardNavigationRequest | null;
  streamControlRequest: StreamControlRequest | null;
  readerSession: ReaderSessionState;
  bookSessionWorkflow: BookSessionWorkflowState;
  audio: AudioState;
  chapterVersionNavigationRequest: ChapterVersionNavigationRequest | null;
  chapterTextContext: ChapterTextContextState;
  refreshTokens: AppRefreshTokens;
  readerPreferences: ReaderPreferencesState;
  streamUiControls: StreamUiControlsState;
  unitWorkflow: UnitWorkflowState;
  ocrEdit: OcrEditState;
  floatingAudio: FloatingAudioState;
  printWorkflow: PrintWorkflowState;
  tocWorkflow: TocWorkflowState;
  searchWorkflow: SearchWorkflowState;
  bookmarkWorkflow: BookmarkWorkflowState;
  quizWorkflow: QuizWorkflowState;
  vocabularyWorkflow: VocabularyWorkflowState;
  memoryCardWorkflow: MemoryCardWorkflowState;
  pageTextWorkflow: PageTextWorkflowState;
  imagePreviewWorkflow: ImagePreviewWorkflowState;
  viewerWorkflow: ViewerWorkflowState;
  voiceWorkflow: VoiceWorkflowState;
}

export type AppAction =
  | { type: 'modal/open'; modal: SimpleModal }
  | { type: 'modal/close'; modal: SimpleModal }
  | { type: 'modal/setOpen'; modal: SimpleModal; open: boolean }
  | { type: 'bookCard/open'; bookId: string }
  | { type: 'bookCard/close' }
  | { type: 'bookCard/setOpen'; open: boolean }
  | { type: 'bookCard/setBookId'; bookId: string | null }
  | { type: 'fullscreen/set'; fullscreen: boolean }
  | { type: 'toast/show'; toast: ToastMessage }
  | { type: 'toast/dismiss' }
  | { type: 'imagePreview/open'; preview: ImagePreviewTarget }
  | { type: 'imagePreview/close' }
  | { type: 'imagePreview/setEnhancedUrl'; url: string | null }
  | { type: 'editor/setOpen'; open: boolean }
  | { type: 'editor/setChapterNumber'; chapterNumber: number | null }
  | { type: 'editor/setTextVersion'; textVersion: ChapterEditorTextVersion | null }
  | { type: 'settingsToolbar/setTab'; tab: AppToolbarTab }
  | { type: 'navigation/setMainView'; view: MainView }
  | { type: 'navigation/setSelectedUnitSetId'; id: string | null }
  | { type: 'navigation/setSelectedUnitTopicId'; id: string | null }
  | { type: 'pageNavigation/request'; pageIndex: number }
  | { type: 'pageNavigation/requestPrevious' }
  | { type: 'pageNavigation/requestNext' }
  | { type: 'pageNavigation/clear' }
  | { type: 'dashboardNavigation/requestBook'; bookId: string }
  | {
      type: 'dashboardNavigation/requestChapter';
      bookId: string;
      chapterNumber: number | null;
      subchapterTitle?: string | null;
      pageNumber?: number | null;
      pageKeyEnd?: string | null;
    }
  | { type: 'dashboardNavigation/requestUnit'; unitSetId: string; topicId: string }
  | { type: 'dashboardNavigation/requestAudioLibraryBook'; bookId: string; chapterNumber: number }
  | { type: 'dashboardNavigation/requestUnitSource'; bookId: string; chapterNumber: number }
  | { type: 'dashboardNavigation/clear' }
  | { type: 'streamControl/requestPlayVisible' }
  | { type: 'streamControl/requestStop' }
  | { type: 'streamControl/requestTogglePause' }
  | { type: 'streamControl/requestSetVoice'; voice: string }
  | { type: 'streamControl/clear' }
  | { type: 'readerSession/setBookId'; bookId: string | null }
  | { type: 'readerSession/setCurrentPage'; page: number }
  | { type: 'readerSession/setViewMode'; mode: ViewMode }
  | { type: 'bookSessionWorkflow/setBooks'; books: string[] }
  | { type: 'bookSessionWorkflow/setManifest'; manifest: string[] }
  | { type: 'bookSessionWorkflow/setBookType'; bookType: 'image' | 'text' }
  | { type: 'bookSessionWorkflow/setChapterCount'; chapterCount: number }
  | { type: 'bookSessionWorkflow/setLoading'; loading: boolean }
  | { type: 'bookSessionWorkflow/setUploadingChapter'; uploading: boolean }
  | { type: 'bookSessionWorkflow/setDeletingChapter'; deleting: boolean }
  | { type: 'bookSessionWorkflow/setUploadingPdf'; uploading: boolean }
  | { type: 'bookSessionWorkflow/setLibraryStateReady'; ready: boolean }
  | { type: 'audio/reset' }
  | { type: 'audio/stop' }
  | { type: 'audio/syncFloating'; playbackState: FloatingAudioPlaybackState; track: FloatingAudioTrack; pageKey: string | null }
  | {
      type: 'chapterVersionNavigation/request';
      chapterNumber: number;
      versionId: string;
    }
  | { type: 'chapterVersionNavigation/clear' }
  | { type: 'chapterText/setDisplayed'; displayedChapterText: DisplayedChapterText | null }
  | { type: 'chapterText/setFirstParagraph'; firstChapterParagraph: ChapterParagraph | null }
  | { type: 'refresh/chapterView' }
  | { type: 'refresh/bookCards' }
  | { type: 'preferences/setPageTextOcrEngine'; engine: PageTextOcrEngine }
  | { type: 'preferences/setQuizAutoPlayEnabled'; enabled: boolean }
  | { type: 'streamUi/toggleAutoFollow' }
  | { type: 'streamUi/setSelectedBlockKey'; key: string | null }
  | { type: 'streamUi/setPlaybackRate'; rate: number }
  | { type: 'unitWorkflow/refresh' }
  | { type: 'unitWorkflow/setQuizLabel'; label: string }
  | { type: 'unitWorkflow/setCreating'; creating: boolean }
  | { type: 'ocrEdit/setMode'; enabled: boolean }
  | { type: 'ocrEdit/setSaving'; saving: boolean }
  | { type: 'floatingAudio/play'; track: FloatingAudioTrack }
  | { type: 'floatingAudio/close' }
  | { type: 'floatingAudio/setPlaybackState'; playbackState: FloatingAudioPlaybackState }
  | { type: 'printWorkflow/setSelection'; selection: string }
  | { type: 'printWorkflow/setLoading'; loading: boolean }
  | { type: 'tocWorkflow/reset' }
  | { type: 'tocWorkflow/setVariant'; variant: TocVariant }
  | { type: 'tocWorkflow/setEntries'; entries: TocEntry[] }
  | { type: 'tocWorkflow/setDetailedEntries'; entries: TocEntry[] }
  | { type: 'tocWorkflow/setLoading'; loading: boolean }
  | { type: 'tocWorkflow/setGenerating'; generating: boolean }
  | { type: 'tocWorkflow/setSaving'; saving: boolean }
  | { type: 'tocWorkflow/setChapterGeneratingIndex'; index: number | null }
  | { type: 'searchWorkflow/reset' }
  | { type: 'searchWorkflow/setQuery'; query: string }
  | { type: 'searchWorkflow/setResults'; results: SearchResult[] }
  | { type: 'searchWorkflow/setLoading'; loading: boolean }
  | { type: 'bookmarkWorkflow/reset' }
  | { type: 'bookmarkWorkflow/setItems'; items: Bookmark[] }
  | { type: 'bookmarkWorkflow/setLoading'; loading: boolean }
  | { type: 'quizWorkflow/reset'; modal: QuizModal }
  | { type: 'quizWorkflow/setLoading'; modal: QuizModal; loading: boolean }
  | { type: 'quizWorkflow/setError'; modal: QuizModal; error: string | null }
  | { type: 'quizWorkflow/setQuiz'; modal: QuizModal; quiz: Quiz | null }
  | { type: 'vocabularyWorkflow/reset' }
  | { type: 'vocabularyWorkflow/setLoading'; loading: boolean }
  | { type: 'vocabularyWorkflow/setError'; error: string | null }
  | { type: 'vocabularyWorkflow/setVocabulary'; vocabulary: ChapterVocabulary | null }
  | { type: 'memoryCardWorkflow/reset' }
  | { type: 'memoryCardWorkflow/setLoading'; loading: boolean }
  | { type: 'memoryCardWorkflow/setError'; error: string | null }
  | { type: 'memoryCardWorkflow/setMemoryCard'; memoryCard: ChapterMemoryCard | null }
  | { type: 'pageTextWorkflow/reset' }
  | { type: 'pageTextWorkflow/setEntry'; image: string; entry: PageText }
  | { type: 'pageTextWorkflow/setLoading'; loading: boolean }
  | { type: 'pageTextWorkflow/setSaving'; saving: boolean }
  | { type: 'pageTextWorkflow/setRegenerated'; regenerated: boolean }
  | { type: 'imagePreviewWorkflow/resetStatus' }
  | { type: 'imagePreviewWorkflow/setEnhancedUrl'; key: string; url: string | null }
  | { type: 'imagePreviewWorkflow/setEnhancing'; enhancing: boolean }
  | { type: 'imagePreviewWorkflow/setError'; error: string | null }
  | { type: 'viewerWorkflow/setSettings'; settings: AppSettings }
  | { type: 'viewerWorkflow/setMetrics'; metrics: ViewerMetrics | null }
  | { type: 'voiceWorkflow/setVoiceOptions'; options: StreamVoiceOption[]; defaultVoice: StreamVoice }
  | { type: 'voiceWorkflow/setStreamVoice'; voice: StreamVoice }
  | { type: 'voiceWorkflow/setMp3Voice'; voice: StreamVoice };

function getInitialNavigation(): AppNavigationState {
  if (typeof window === 'undefined') {
    return {
      mainView: 'reader',
      selectedUnitSetId: null,
      selectedUnitTopicId: null
    };
  }
  const params = new URLSearchParams(window.location.search);
  const mainView = params.get('view') === 'units' ? 'units' : 'reader';
  return {
    mainView,
    selectedUnitSetId: mainView === 'units' ? params.get('unit') : null,
    selectedUnitTopicId: mainView === 'units' ? params.get('topic') : null
  };
}

function getInitialReaderSession(): ReaderSessionState {
  if (typeof window === 'undefined') {
    return {
      bookId: null,
      currentPage: 0,
      viewMode: 'pages'
    };
  }
  const params = new URLSearchParams(window.location.search);
  const book = params.get('book')?.trim();
  return {
    bookId: book ? book : null,
    currentPage: 0,
    viewMode: 'pages'
  };
}

const initialAudioState: AudioState = {
  status: 'idle',
  url: null,
  source: null,
  provider: null,
  currentPageKey: null
};

const initialTocWorkflow: TocWorkflowState = {
  variant: 'main',
  entries: [],
  detailedEntries: [],
  loading: false,
  generating: false,
  saving: false,
  chapterGeneratingIndex: null
};

const initialAppState: CentralAppState = {
  ui: {
    modals: {
      help: false,
      listeningDashboard: false,
      ocrQueue: false,
      jobWorker: false,
      search: false,
      promptEditor: false,
      settings: false,
      tocNav: false,
      tocManage: false,
      text: false,
      print: false,
      bookmarks: false,
      chapterQuiz: false,
      unitQuiz: false,
      vocabulary: false,
      memoryCard: false,
      bookSelect: false,
      bookCard: false
    },
    fullscreen: false,
    toast: null,
    bookCardBookId: null,
    imagePreview: null,
    editor: {
      open: false,
      chapterNumber: null,
      textVersion: null
    },
    settingsToolbar: {
      activeTab: 'image'
    }
  },
  navigation: getInitialNavigation(),
  pageNavigationRequest: null,
  dashboardNavigationRequest: null,
  streamControlRequest: null,
  readerSession: getInitialReaderSession(),
  bookSessionWorkflow: {
    books: [],
    manifest: [],
    bookType: 'image',
    chapterCount: 0,
    loading: false,
    uploadingChapter: false,
    deletingChapter: false,
    uploadingPdf: false,
    libraryStateReady: false
  },
  audio: initialAudioState,
  chapterVersionNavigationRequest: null,
  chapterTextContext: {
    displayedChapterText: null,
    firstChapterParagraph: null
  },
  refreshTokens: {
    chapterView: 0,
    bookCards: 0
  },
  readerPreferences: {
    pageTextOcrEngine: 'deepseek_ocr',
    quizAutoPlayEnabled: true
  },
  streamUiControls: {
    autoFollowStream: true,
    selectedStreamBlockKey: null,
    playbackRate: 1
  },
  unitWorkflow: {
    refreshToken: 0,
    quizLabel: 'Topic',
    creating: false
  },
  ocrEdit: {
    editMode: false,
    saving: false
  },
  floatingAudio: {
    track: null,
    playbackState: 'idle'
  },
  printWorkflow: {
    selection: 'current',
    loading: false
  },
  tocWorkflow: initialTocWorkflow,
  searchWorkflow: {
    query: '',
    results: [],
    loading: false
  },
  bookmarkWorkflow: {
    items: [],
    loading: false
  },
  quizWorkflow: {
    chapterQuiz: {
      loading: false,
      error: null,
      quiz: null
    },
    unitQuiz: {
      loading: false,
      error: null,
      quiz: null
    }
  },
  vocabularyWorkflow: {
    loading: false,
    error: null,
    vocabulary: null
  },
  memoryCardWorkflow: {
    loading: false,
    error: null,
    memoryCard: null
  },
  pageTextWorkflow: {
    cache: {},
    loading: false,
    saving: false,
    regenerated: false
  },
  imagePreviewWorkflow: {
    enhancedUrls: {},
    enhancing: false,
    error: null
  },
  viewerWorkflow: {
    settings: createDefaultSettings(),
    metrics: null
  },
  voiceWorkflow: {
    streamVoiceOptions: [],
    defaultStreamVoice: '',
    streamVoice: '',
    mp3Voice: ''
  }
};

export const appActions = {
  openModal: (modal: SimpleModal): AppAction => ({ type: 'modal/open', modal }),
  closeModal: (modal: SimpleModal): AppAction => ({ type: 'modal/close', modal }),
  setModalOpen: (modal: SimpleModal, open: boolean): AppAction => ({
    type: 'modal/setOpen',
    modal,
    open
  }),
  openBookCard: (bookId: string): AppAction => ({ type: 'bookCard/open', bookId }),
  closeBookCard: (): AppAction => ({ type: 'bookCard/close' }),
  setBookCardOpen: (open: boolean): AppAction => ({ type: 'bookCard/setOpen', open }),
  setBookCardBookId: (bookId: string | null): AppAction => ({ type: 'bookCard/setBookId', bookId }),
  setFullscreen: (fullscreen: boolean): AppAction => ({ type: 'fullscreen/set', fullscreen }),
  showToast: (toast: ToastMessage): AppAction => ({ type: 'toast/show', toast }),
  dismissToast: (): AppAction => ({ type: 'toast/dismiss' }),
  openImagePreview: (preview: ImagePreviewTarget): AppAction => ({ type: 'imagePreview/open', preview }),
  closeImagePreview: (): AppAction => ({ type: 'imagePreview/close' }),
  setImagePreviewEnhancedUrl: (url: string | null): AppAction => ({
    type: 'imagePreview/setEnhancedUrl',
    url
  }),
  setEditorOpen: (open: boolean): AppAction => ({ type: 'editor/setOpen', open }),
  setEditorChapterNumber: (chapterNumber: number | null): AppAction => ({
    type: 'editor/setChapterNumber',
    chapterNumber
  }),
  setEditorTextVersion: (textVersion: ChapterEditorTextVersion | null): AppAction => ({
    type: 'editor/setTextVersion',
    textVersion
  }),
  setSettingsToolbarTab: (tab: AppToolbarTab): AppAction => ({ type: 'settingsToolbar/setTab', tab }),
  setMainView: (view: MainView): AppAction => ({ type: 'navigation/setMainView', view }),
  setSelectedUnitSetId: (id: string | null): AppAction => ({
    type: 'navigation/setSelectedUnitSetId',
    id
  }),
  setSelectedUnitTopicId: (id: string | null): AppAction => ({
    type: 'navigation/setSelectedUnitTopicId',
    id
  }),
  requestPageNavigation: (pageIndex: number): AppAction => ({
    type: 'pageNavigation/request',
    pageIndex
  }),
  requestPreviousPageNavigation: (): AppAction => ({ type: 'pageNavigation/requestPrevious' }),
  requestNextPageNavigation: (): AppAction => ({ type: 'pageNavigation/requestNext' }),
  clearPageNavigation: (): AppAction => ({ type: 'pageNavigation/clear' }),
  requestDashboardBookNavigation: (bookId: string): AppAction => ({
    type: 'dashboardNavigation/requestBook',
    bookId
  }),
  requestDashboardChapterNavigation: (
    bookId: string,
    chapterNumber: number | null,
    subchapterTitle?: string | null,
    pageNumber?: number | null,
    pageKeyEnd?: string | null
  ): AppAction => ({
    type: 'dashboardNavigation/requestChapter',
    bookId,
    chapterNumber,
    subchapterTitle,
    pageNumber,
    pageKeyEnd
  }),
  requestDashboardUnitNavigation: (unitSetId: string, topicId: string): AppAction => ({
    type: 'dashboardNavigation/requestUnit',
    unitSetId,
    topicId
  }),
  requestAudioLibraryBookNavigation: (bookId: string, chapterNumber: number): AppAction => ({
    type: 'dashboardNavigation/requestAudioLibraryBook',
    bookId,
    chapterNumber
  }),
  requestUnitSourceNavigation: (bookId: string, chapterNumber: number): AppAction => ({
    type: 'dashboardNavigation/requestUnitSource',
    bookId,
    chapterNumber
  }),
  clearDashboardNavigation: (): AppAction => ({ type: 'dashboardNavigation/clear' }),
  requestPlayVisibleStream: (): AppAction => ({ type: 'streamControl/requestPlayVisible' }),
  requestStopStream: (): AppAction => ({ type: 'streamControl/requestStop' }),
  requestToggleStreamPause: (): AppAction => ({ type: 'streamControl/requestTogglePause' }),
  requestStreamVoiceChange: (voice: string): AppAction => ({
    type: 'streamControl/requestSetVoice',
    voice
  }),
  clearStreamControlRequest: (): AppAction => ({ type: 'streamControl/clear' }),
  setReaderBookId: (bookId: string | null): AppAction => ({
    type: 'readerSession/setBookId',
    bookId
  }),
  setReaderCurrentPage: (page: number): AppAction => ({
    type: 'readerSession/setCurrentPage',
    page
  }),
  setReaderViewMode: (mode: ViewMode): AppAction => ({
    type: 'readerSession/setViewMode',
    mode
  }),
  setBookSessionBooks: (books: string[]): AppAction => ({
    type: 'bookSessionWorkflow/setBooks',
    books
  }),
  setBookSessionManifest: (manifest: string[]): AppAction => ({
    type: 'bookSessionWorkflow/setManifest',
    manifest
  }),
  setBookSessionBookType: (bookType: 'image' | 'text'): AppAction => ({
    type: 'bookSessionWorkflow/setBookType',
    bookType
  }),
  setBookSessionChapterCount: (chapterCount: number): AppAction => ({
    type: 'bookSessionWorkflow/setChapterCount',
    chapterCount
  }),
  setBookSessionLoading: (loading: boolean): AppAction => ({
    type: 'bookSessionWorkflow/setLoading',
    loading
  }),
  setBookSessionUploadingChapter: (uploading: boolean): AppAction => ({
    type: 'bookSessionWorkflow/setUploadingChapter',
    uploading
  }),
  setBookSessionDeletingChapter: (deleting: boolean): AppAction => ({
    type: 'bookSessionWorkflow/setDeletingChapter',
    deleting
  }),
  setBookSessionUploadingPdf: (uploading: boolean): AppAction => ({
    type: 'bookSessionWorkflow/setUploadingPdf',
    uploading
  }),
  setBookSessionLibraryStateReady: (ready: boolean): AppAction => ({
    type: 'bookSessionWorkflow/setLibraryStateReady',
    ready
  }),
  resetAudio: (): AppAction => ({ type: 'audio/reset' }),
  stopAudio: (): AppAction => ({ type: 'audio/stop' }),
  syncFloatingAudio: (
    playbackState: FloatingAudioPlaybackState,
    track: FloatingAudioTrack,
    pageKey: string | null
  ): AppAction => ({
    type: 'audio/syncFloating',
    playbackState,
    track,
    pageKey
  }),
  requestChapterVersionNavigation: (chapterNumber: number, versionId: string): AppAction => ({
    type: 'chapterVersionNavigation/request',
    chapterNumber,
    versionId
  }),
  clearChapterVersionNavigation: (): AppAction => ({ type: 'chapterVersionNavigation/clear' }),
  setDisplayedChapterText: (displayedChapterText: DisplayedChapterText | null): AppAction => ({
    type: 'chapterText/setDisplayed',
    displayedChapterText
  }),
  setFirstChapterParagraph: (firstChapterParagraph: ChapterParagraph | null): AppAction => ({
    type: 'chapterText/setFirstParagraph',
    firstChapterParagraph
  }),
  refreshChapterView: (): AppAction => ({ type: 'refresh/chapterView' }),
  refreshBookCards: (): AppAction => ({ type: 'refresh/bookCards' }),
  setPageTextOcrEngine: (engine: PageTextOcrEngine): AppAction => ({
    type: 'preferences/setPageTextOcrEngine',
    engine
  }),
  setQuizAutoPlayEnabled: (enabled: boolean): AppAction => ({
    type: 'preferences/setQuizAutoPlayEnabled',
    enabled
  }),
  toggleAutoFollowStream: (): AppAction => ({ type: 'streamUi/toggleAutoFollow' }),
  setSelectedStreamBlockKey: (key: string | null): AppAction => ({
    type: 'streamUi/setSelectedBlockKey',
    key
  }),
  setPlaybackRate: (rate: number): AppAction => ({ type: 'streamUi/setPlaybackRate', rate }),
  refreshUnits: (): AppAction => ({ type: 'unitWorkflow/refresh' }),
  setUnitQuizLabel: (label: string): AppAction => ({
    type: 'unitWorkflow/setQuizLabel',
    label
  }),
  setUnitCreating: (creating: boolean): AppAction => ({
    type: 'unitWorkflow/setCreating',
    creating
  }),
  setOcrEditMode: (enabled: boolean): AppAction => ({
    type: 'ocrEdit/setMode',
    enabled
  }),
  setOcrEditSaving: (saving: boolean): AppAction => ({
    type: 'ocrEdit/setSaving',
    saving
  }),
  playFloatingAudio: (track: FloatingAudioTrack): AppAction => ({
    type: 'floatingAudio/play',
    track
  }),
  closeFloatingAudio: (): AppAction => ({ type: 'floatingAudio/close' }),
  setFloatingAudioPlaybackState: (playbackState: FloatingAudioPlaybackState): AppAction => ({
    type: 'floatingAudio/setPlaybackState',
    playbackState
  }),
  setPrintSelection: (selection: string): AppAction => ({
    type: 'printWorkflow/setSelection',
    selection
  }),
  setPrintLoading: (loading: boolean): AppAction => ({
    type: 'printWorkflow/setLoading',
    loading
  }),
  resetTocWorkflow: (): AppAction => ({ type: 'tocWorkflow/reset' }),
  setTocVariant: (variant: TocVariant): AppAction => ({
    type: 'tocWorkflow/setVariant',
    variant
  }),
  setTocEntries: (entries: TocEntry[]): AppAction => ({
    type: 'tocWorkflow/setEntries',
    entries
  }),
  setDetailedTocEntries: (entries: TocEntry[]): AppAction => ({
    type: 'tocWorkflow/setDetailedEntries',
    entries
  }),
  setTocLoading: (loading: boolean): AppAction => ({
    type: 'tocWorkflow/setLoading',
    loading
  }),
  setTocGenerating: (generating: boolean): AppAction => ({
    type: 'tocWorkflow/setGenerating',
    generating
  }),
  setTocSaving: (saving: boolean): AppAction => ({
    type: 'tocWorkflow/setSaving',
    saving
  }),
  setTocChapterGeneratingIndex: (index: number | null): AppAction => ({
    type: 'tocWorkflow/setChapterGeneratingIndex',
    index
  }),
  resetSearch: (): AppAction => ({ type: 'searchWorkflow/reset' }),
  setSearchQuery: (query: string): AppAction => ({
    type: 'searchWorkflow/setQuery',
    query
  }),
  setSearchResults: (results: SearchResult[]): AppAction => ({
    type: 'searchWorkflow/setResults',
    results
  }),
  setSearchLoading: (loading: boolean): AppAction => ({
    type: 'searchWorkflow/setLoading',
    loading
  }),
  resetBookmarks: (): AppAction => ({ type: 'bookmarkWorkflow/reset' }),
  setBookmarks: (items: Bookmark[]): AppAction => ({
    type: 'bookmarkWorkflow/setItems',
    items
  }),
  setBookmarksLoading: (loading: boolean): AppAction => ({
    type: 'bookmarkWorkflow/setLoading',
    loading
  }),
  resetQuiz: (modal: QuizModal): AppAction => ({
    type: 'quizWorkflow/reset',
    modal
  }),
  setQuizLoading: (modal: QuizModal, loading: boolean): AppAction => ({
    type: 'quizWorkflow/setLoading',
    modal,
    loading
  }),
  setQuizError: (modal: QuizModal, error: string | null): AppAction => ({
    type: 'quizWorkflow/setError',
    modal,
    error
  }),
  setQuiz: (modal: QuizModal, quiz: Quiz | null): AppAction => ({
    type: 'quizWorkflow/setQuiz',
    modal,
    quiz
  }),
  resetVocabulary: (): AppAction => ({ type: 'vocabularyWorkflow/reset' }),
  setVocabularyLoading: (loading: boolean): AppAction => ({
    type: 'vocabularyWorkflow/setLoading',
    loading
  }),
  setVocabularyError: (error: string | null): AppAction => ({
    type: 'vocabularyWorkflow/setError',
    error
  }),
  setVocabulary: (vocabulary: ChapterVocabulary | null): AppAction => ({
    type: 'vocabularyWorkflow/setVocabulary',
    vocabulary
  }),
  resetMemoryCard: (): AppAction => ({ type: 'memoryCardWorkflow/reset' }),
  setMemoryCardLoading: (loading: boolean): AppAction => ({
    type: 'memoryCardWorkflow/setLoading',
    loading
  }),
  setMemoryCardError: (error: string | null): AppAction => ({
    type: 'memoryCardWorkflow/setError',
    error
  }),
  setMemoryCard: (memoryCard: ChapterMemoryCard | null): AppAction => ({
    type: 'memoryCardWorkflow/setMemoryCard',
    memoryCard
  }),
  resetPageText: (): AppAction => ({ type: 'pageTextWorkflow/reset' }),
  setPageTextEntry: (image: string, entry: PageText): AppAction => ({
    type: 'pageTextWorkflow/setEntry',
    image,
    entry
  }),
  setPageTextLoading: (loading: boolean): AppAction => ({
    type: 'pageTextWorkflow/setLoading',
    loading
  }),
  setPageTextSaving: (saving: boolean): AppAction => ({
    type: 'pageTextWorkflow/setSaving',
    saving
  }),
  setRegeneratedPageText: (regenerated: boolean): AppAction => ({
    type: 'pageTextWorkflow/setRegenerated',
    regenerated
  }),
  resetImagePreviewStatus: (): AppAction => ({ type: 'imagePreviewWorkflow/resetStatus' }),
  setImagePreviewCachedEnhancedUrl: (key: string, url: string | null): AppAction => ({
    type: 'imagePreviewWorkflow/setEnhancedUrl',
    key,
    url
  }),
  setImagePreviewEnhancing: (enhancing: boolean): AppAction => ({
    type: 'imagePreviewWorkflow/setEnhancing',
    enhancing
  }),
  setImagePreviewError: (error: string | null): AppAction => ({
    type: 'imagePreviewWorkflow/setError',
    error
  }),
  setViewerSettings: (settings: AppSettings): AppAction => ({
    type: 'viewerWorkflow/setSettings',
    settings
  }),
  setViewerMetrics: (metrics: ViewerMetrics | null): AppAction => ({
    type: 'viewerWorkflow/setMetrics',
    metrics
  }),
  setVoiceOptions: (options: StreamVoiceOption[], defaultVoice: StreamVoice): AppAction => ({
    type: 'voiceWorkflow/setVoiceOptions',
    options,
    defaultVoice
  }),
  setStreamVoice: (voice: StreamVoice): AppAction => ({
    type: 'voiceWorkflow/setStreamVoice',
    voice
  }),
  setMp3Voice: (voice: StreamVoice): AppAction => ({
    type: 'voiceWorkflow/setMp3Voice',
    voice
  })
};

export function appReducer(state: CentralAppState, action: AppAction): CentralAppState {
  switch (action.type) {
    case 'modal/open':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            [action.modal]: true
          }
        }
      };
    case 'modal/close':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            [action.modal]: false
          }
        }
      };
    case 'modal/setOpen':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            [action.modal]: action.open
          }
        }
      };
    case 'bookCard/open':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            bookCard: true
          },
          bookCardBookId: action.bookId
        }
      };
    case 'bookCard/close':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            bookCard: false
          },
          bookCardBookId: null
        }
      };
    case 'bookCard/setOpen':
      return {
        ...state,
        ui: {
          ...state.ui,
          modals: {
            ...state.ui.modals,
            bookCard: action.open
          }
        }
      };
    case 'bookCard/setBookId':
      return {
        ...state,
        ui: {
          ...state.ui,
          bookCardBookId: action.bookId
        }
      };
    case 'fullscreen/set':
      return {
        ...state,
        ui: {
          ...state.ui,
          fullscreen: action.fullscreen
        }
      };
    case 'toast/show':
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: action.toast
        }
      };
    case 'toast/dismiss':
      return {
        ...state,
        ui: {
          ...state.ui,
          toast: null
        }
      };
    case 'imagePreview/open':
      return {
        ...state,
        ui: {
          ...state.ui,
          imagePreview: action.preview
        }
      };
    case 'imagePreview/close':
      return {
        ...state,
        ui: {
          ...state.ui,
          imagePreview: null
        }
      };
    case 'imagePreview/setEnhancedUrl':
      return {
        ...state,
        ui: {
          ...state.ui,
          imagePreview: state.ui.imagePreview
            ? {
                ...state.ui.imagePreview,
                enhancedUrl: action.url
              }
            : null
        }
      };
    case 'editor/setOpen':
      return {
        ...state,
        ui: {
          ...state.ui,
          editor: {
            ...state.ui.editor,
            open: action.open
          }
        }
      };
    case 'editor/setChapterNumber':
      return {
        ...state,
        ui: {
          ...state.ui,
          editor: {
            ...state.ui.editor,
            chapterNumber: action.chapterNumber
          }
        }
      };
    case 'editor/setTextVersion':
      return {
        ...state,
        ui: {
          ...state.ui,
          editor: {
            ...state.ui.editor,
            textVersion: action.textVersion
          }
        }
      };
    case 'settingsToolbar/setTab':
      return {
        ...state,
        ui: {
          ...state.ui,
          settingsToolbar: {
            activeTab: action.tab
          }
        }
      };
    case 'navigation/setMainView':
      return {
        ...state,
        navigation: {
          ...state.navigation,
          mainView: action.view
        }
      };
    case 'navigation/setSelectedUnitSetId':
      return {
        ...state,
        navigation: {
          ...state.navigation,
          selectedUnitSetId: action.id
        }
      };
    case 'navigation/setSelectedUnitTopicId':
      return {
        ...state,
        navigation: {
          ...state.navigation,
          selectedUnitTopicId: action.id
        }
      };
    case 'pageNavigation/request':
      return {
        ...state,
        pageNavigationRequest: {
          id: (state.pageNavigationRequest?.id ?? 0) + 1,
          kind: 'page',
          pageIndex: action.pageIndex
        }
      };
    case 'pageNavigation/requestPrevious':
      return {
        ...state,
        pageNavigationRequest: {
          id: (state.pageNavigationRequest?.id ?? 0) + 1,
          kind: 'previous'
        }
      };
    case 'pageNavigation/requestNext':
      return {
        ...state,
        pageNavigationRequest: {
          id: (state.pageNavigationRequest?.id ?? 0) + 1,
          kind: 'next'
        }
      };
    case 'pageNavigation/clear':
      return {
        ...state,
        pageNavigationRequest: null
      };
    case 'dashboardNavigation/requestBook':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: (state.dashboardNavigationRequest?.id ?? 0) + 1,
          kind: 'dashboardBook',
          bookId: action.bookId
        }
      };
    case 'dashboardNavigation/requestChapter':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: (state.dashboardNavigationRequest?.id ?? 0) + 1,
          kind: 'dashboardChapter',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber,
          subchapterTitle: action.subchapterTitle,
          pageNumber: action.pageNumber,
          pageKeyEnd: action.pageKeyEnd
        }
      };
    case 'dashboardNavigation/requestUnit':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: (state.dashboardNavigationRequest?.id ?? 0) + 1,
          kind: 'dashboardUnit',
          unitSetId: action.unitSetId,
          topicId: action.topicId
        }
      };
    case 'dashboardNavigation/requestAudioLibraryBook':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: (state.dashboardNavigationRequest?.id ?? 0) + 1,
          kind: 'audioLibraryBook',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber
        }
      };
    case 'dashboardNavigation/requestUnitSource':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: (state.dashboardNavigationRequest?.id ?? 0) + 1,
          kind: 'unitSource',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber
        }
      };
    case 'dashboardNavigation/clear':
      return {
        ...state,
        dashboardNavigationRequest: null
      };
    case 'streamControl/requestPlayVisible':
      return {
        ...state,
        streamControlRequest: {
          id: (state.streamControlRequest?.id ?? 0) + 1,
          kind: 'playVisible'
        }
      };
    case 'streamControl/requestStop':
      return {
        ...state,
        streamControlRequest: {
          id: (state.streamControlRequest?.id ?? 0) + 1,
          kind: 'stop'
        }
      };
    case 'streamControl/requestTogglePause':
      return {
        ...state,
        streamControlRequest: {
          id: (state.streamControlRequest?.id ?? 0) + 1,
          kind: 'togglePause'
        }
      };
    case 'streamControl/requestSetVoice':
      return {
        ...state,
        streamControlRequest: {
          id: (state.streamControlRequest?.id ?? 0) + 1,
          kind: 'setVoice',
          voice: action.voice
        }
      };
    case 'streamControl/clear':
      return {
        ...state,
        streamControlRequest: null
      };
    case 'readerSession/setBookId':
      return {
        ...state,
        readerSession: {
          ...state.readerSession,
          bookId: action.bookId
        }
      };
    case 'readerSession/setCurrentPage':
      return {
        ...state,
        readerSession: {
          ...state.readerSession,
          currentPage: action.page
        }
      };
    case 'readerSession/setViewMode':
      return {
        ...state,
        readerSession: {
          ...state.readerSession,
          viewMode: action.mode
        }
      };
    case 'bookSessionWorkflow/setBooks':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          books: action.books
        }
      };
    case 'bookSessionWorkflow/setManifest':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          manifest: action.manifest
        }
      };
    case 'bookSessionWorkflow/setBookType':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          bookType: action.bookType
        }
      };
    case 'bookSessionWorkflow/setChapterCount':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          chapterCount: action.chapterCount
        }
      };
    case 'bookSessionWorkflow/setLoading':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          loading: action.loading
        }
      };
    case 'bookSessionWorkflow/setUploadingChapter':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          uploadingChapter: action.uploading
        }
      };
    case 'bookSessionWorkflow/setDeletingChapter':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          deletingChapter: action.deleting
        }
      };
    case 'bookSessionWorkflow/setUploadingPdf':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          uploadingPdf: action.uploading
        }
      };
    case 'bookSessionWorkflow/setLibraryStateReady':
      return {
        ...state,
        bookSessionWorkflow: {
          ...state.bookSessionWorkflow,
          libraryStateReady: action.ready
        }
      };
    case 'audio/reset':
      return {
        ...state,
        audio: { ...initialAudioState }
      };
    case 'audio/stop':
      return {
        ...state,
        audio: {
          ...state.audio,
          status: 'idle',
          source: null,
          provider: null,
          currentPageKey: null
        }
      };
    case 'audio/syncFloating': {
      if (action.track.kind !== 'page-tts' && action.track.kind !== 'text-tts') {
        return state;
      }
      if (action.playbackState === 'ended') {
        return {
          ...state,
          audio: {
            ...state.audio,
            status: 'idle',
            url: action.track.url,
            source: state.audio.source ?? 'ai',
            provider: null,
            currentPageKey: null
          }
        };
      }
      return {
        ...state,
        audio: {
          ...state.audio,
          status: action.playbackState,
          url: action.track.url,
          source: state.audio.source ?? 'ai',
          provider: action.track.provider === 'xai' ? 'xai' : 'openai',
          currentPageKey: action.pageKey,
          error: action.playbackState === 'error' ? 'Playback failed' : undefined
        }
      };
    }
    case 'chapterVersionNavigation/request':
      return {
        ...state,
        chapterVersionNavigationRequest: {
          id: (state.chapterVersionNavigationRequest?.id ?? 0) + 1,
          chapterNumber: action.chapterNumber,
          versionId: action.versionId
        }
      };
    case 'chapterVersionNavigation/clear':
      return {
        ...state,
        chapterVersionNavigationRequest: null
      };
    case 'chapterText/setDisplayed':
      return {
        ...state,
        chapterTextContext: {
          ...state.chapterTextContext,
          displayedChapterText: action.displayedChapterText
        }
      };
    case 'chapterText/setFirstParagraph':
      return {
        ...state,
        chapterTextContext: {
          ...state.chapterTextContext,
          firstChapterParagraph: action.firstChapterParagraph
        }
      };
    case 'refresh/chapterView':
      return {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          chapterView: state.refreshTokens.chapterView + 1
        }
      };
    case 'refresh/bookCards':
      return {
        ...state,
        refreshTokens: {
          ...state.refreshTokens,
          bookCards: state.refreshTokens.bookCards + 1
        }
      };
    case 'preferences/setPageTextOcrEngine':
      return {
        ...state,
        readerPreferences: {
          ...state.readerPreferences,
          pageTextOcrEngine: action.engine
        }
      };
    case 'preferences/setQuizAutoPlayEnabled':
      return {
        ...state,
        readerPreferences: {
          ...state.readerPreferences,
          quizAutoPlayEnabled: action.enabled
        }
      };
    case 'streamUi/toggleAutoFollow':
      return {
        ...state,
        streamUiControls: {
          ...state.streamUiControls,
          autoFollowStream: !state.streamUiControls.autoFollowStream
        }
      };
    case 'streamUi/setSelectedBlockKey':
      return {
        ...state,
        streamUiControls: {
          ...state.streamUiControls,
          selectedStreamBlockKey: action.key
        }
      };
    case 'streamUi/setPlaybackRate':
      return {
        ...state,
        streamUiControls: {
          ...state.streamUiControls,
          playbackRate: action.rate
        }
      };
    case 'unitWorkflow/refresh':
      return {
        ...state,
        unitWorkflow: {
          ...state.unitWorkflow,
          refreshToken: state.unitWorkflow.refreshToken + 1
        }
      };
    case 'unitWorkflow/setQuizLabel':
      return {
        ...state,
        unitWorkflow: {
          ...state.unitWorkflow,
          quizLabel: action.label
        }
      };
    case 'unitWorkflow/setCreating':
      return {
        ...state,
        unitWorkflow: {
          ...state.unitWorkflow,
          creating: action.creating
        }
      };
    case 'ocrEdit/setMode':
      return {
        ...state,
        ocrEdit: {
          ...state.ocrEdit,
          editMode: action.enabled
        }
      };
    case 'ocrEdit/setSaving':
      return {
        ...state,
        ocrEdit: {
          ...state.ocrEdit,
          saving: action.saving
        }
      };
    case 'floatingAudio/play':
      return {
        ...state,
        floatingAudio: {
          track: action.track.kind ? action.track : { ...action.track, kind: 'file' },
          playbackState: 'loading'
        }
      };
    case 'floatingAudio/close':
      return {
        ...state,
        floatingAudio: {
          track: null,
          playbackState: 'idle'
        }
      };
    case 'floatingAudio/setPlaybackState':
      return {
        ...state,
        floatingAudio: {
          ...state.floatingAudio,
          playbackState: action.playbackState
        }
      };
    case 'printWorkflow/setSelection':
      return {
        ...state,
        printWorkflow: {
          ...state.printWorkflow,
          selection: action.selection
        }
      };
    case 'printWorkflow/setLoading':
      return {
        ...state,
        printWorkflow: {
          ...state.printWorkflow,
          loading: action.loading
        }
      };
    case 'tocWorkflow/reset':
      return {
        ...state,
        tocWorkflow: initialTocWorkflow
      };
    case 'tocWorkflow/setVariant':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          variant: action.variant
        }
      };
    case 'tocWorkflow/setEntries':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          entries: action.entries
        }
      };
    case 'tocWorkflow/setDetailedEntries':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          detailedEntries: action.entries
        }
      };
    case 'tocWorkflow/setLoading':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          loading: action.loading
        }
      };
    case 'tocWorkflow/setGenerating':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          generating: action.generating
        }
      };
    case 'tocWorkflow/setSaving':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          saving: action.saving
        }
      };
    case 'tocWorkflow/setChapterGeneratingIndex':
      return {
        ...state,
        tocWorkflow: {
          ...state.tocWorkflow,
          chapterGeneratingIndex: action.index
        }
      };
    case 'searchWorkflow/reset':
      return {
        ...state,
        searchWorkflow: {
          query: '',
          results: [],
          loading: false
        }
      };
    case 'searchWorkflow/setQuery':
      return {
        ...state,
        searchWorkflow: {
          ...state.searchWorkflow,
          query: action.query
        }
      };
    case 'searchWorkflow/setResults':
      return {
        ...state,
        searchWorkflow: {
          ...state.searchWorkflow,
          results: action.results
        }
      };
    case 'searchWorkflow/setLoading':
      return {
        ...state,
        searchWorkflow: {
          ...state.searchWorkflow,
          loading: action.loading
        }
      };
    case 'bookmarkWorkflow/reset':
      return {
        ...state,
        bookmarkWorkflow: {
          items: [],
          loading: false
        }
      };
    case 'bookmarkWorkflow/setItems':
      return {
        ...state,
        bookmarkWorkflow: {
          ...state.bookmarkWorkflow,
          items: action.items
        }
      };
    case 'bookmarkWorkflow/setLoading':
      return {
        ...state,
        bookmarkWorkflow: {
          ...state.bookmarkWorkflow,
          loading: action.loading
        }
      };
    case 'quizWorkflow/reset':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            loading: false,
            error: null,
            quiz: null
          }
        }
      };
    case 'quizWorkflow/setLoading':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            loading: action.loading
          }
        }
      };
    case 'quizWorkflow/setError':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            error: action.error
          }
        }
      };
    case 'quizWorkflow/setQuiz':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            quiz: action.quiz
          }
        }
      };
    case 'vocabularyWorkflow/reset':
      return {
        ...state,
        vocabularyWorkflow: {
          loading: false,
          error: null,
          vocabulary: null
        }
      };
    case 'vocabularyWorkflow/setLoading':
      return {
        ...state,
        vocabularyWorkflow: {
          ...state.vocabularyWorkflow,
          loading: action.loading
        }
      };
    case 'vocabularyWorkflow/setError':
      return {
        ...state,
        vocabularyWorkflow: {
          ...state.vocabularyWorkflow,
          error: action.error
        }
      };
    case 'vocabularyWorkflow/setVocabulary':
      return {
        ...state,
        vocabularyWorkflow: {
          ...state.vocabularyWorkflow,
          vocabulary: action.vocabulary
        }
      };
    case 'memoryCardWorkflow/reset':
      return {
        ...state,
        memoryCardWorkflow: {
          loading: false,
          error: null,
          memoryCard: null
        }
      };
    case 'memoryCardWorkflow/setLoading':
      return {
        ...state,
        memoryCardWorkflow: {
          ...state.memoryCardWorkflow,
          loading: action.loading
        }
      };
    case 'memoryCardWorkflow/setError':
      return {
        ...state,
        memoryCardWorkflow: {
          ...state.memoryCardWorkflow,
          error: action.error
        }
      };
    case 'memoryCardWorkflow/setMemoryCard':
      return {
        ...state,
        memoryCardWorkflow: {
          ...state.memoryCardWorkflow,
          memoryCard: action.memoryCard
        }
      };
    case 'pageTextWorkflow/reset':
      return {
        ...state,
        pageTextWorkflow: {
          cache: {},
          loading: false,
          saving: false,
          regenerated: false
        }
      };
    case 'pageTextWorkflow/setEntry':
      return {
        ...state,
        pageTextWorkflow: {
          ...state.pageTextWorkflow,
          cache: {
            ...state.pageTextWorkflow.cache,
            [action.image]: action.entry
          }
        }
      };
    case 'pageTextWorkflow/setLoading':
      return {
        ...state,
        pageTextWorkflow: {
          ...state.pageTextWorkflow,
          loading: action.loading
        }
      };
    case 'pageTextWorkflow/setSaving':
      return {
        ...state,
        pageTextWorkflow: {
          ...state.pageTextWorkflow,
          saving: action.saving
        }
      };
    case 'pageTextWorkflow/setRegenerated':
      return {
        ...state,
        pageTextWorkflow: {
          ...state.pageTextWorkflow,
          regenerated: action.regenerated
        }
      };
    case 'imagePreviewWorkflow/resetStatus':
      return {
        ...state,
        imagePreviewWorkflow: {
          ...state.imagePreviewWorkflow,
          enhancing: false,
          error: null
        }
      };
    case 'imagePreviewWorkflow/setEnhancedUrl': {
      const nextEnhancedUrls = { ...state.imagePreviewWorkflow.enhancedUrls };
      if (action.url) {
        nextEnhancedUrls[action.key] = action.url;
      } else {
        delete nextEnhancedUrls[action.key];
      }
      return {
        ...state,
        imagePreviewWorkflow: {
          ...state.imagePreviewWorkflow,
          enhancedUrls: nextEnhancedUrls
        }
      };
    }
    case 'imagePreviewWorkflow/setEnhancing':
      return {
        ...state,
        imagePreviewWorkflow: {
          ...state.imagePreviewWorkflow,
          enhancing: action.enhancing
        }
      };
    case 'imagePreviewWorkflow/setError':
      return {
        ...state,
        imagePreviewWorkflow: {
          ...state.imagePreviewWorkflow,
          error: action.error
        }
      };
    case 'viewerWorkflow/setSettings':
      return {
        ...state,
        viewerWorkflow: {
          ...state.viewerWorkflow,
          settings: action.settings
        }
      };
    case 'viewerWorkflow/setMetrics':
      return {
        ...state,
        viewerWorkflow: {
          ...state.viewerWorkflow,
          metrics: action.metrics
        }
      };
    case 'voiceWorkflow/setVoiceOptions': {
      const streamVoice =
        state.voiceWorkflow.streamVoice && action.options.some((voice) => voice.id === state.voiceWorkflow.streamVoice)
          ? state.voiceWorkflow.streamVoice
          : action.defaultVoice;
      return {
        ...state,
        voiceWorkflow: {
          ...state.voiceWorkflow,
          streamVoiceOptions: action.options,
          defaultStreamVoice: action.defaultVoice,
          streamVoice
        }
      };
    }
    case 'voiceWorkflow/setStreamVoice':
      return {
        ...state,
        voiceWorkflow: {
          ...state.voiceWorkflow,
          streamVoice: action.voice
        }
      };
    case 'voiceWorkflow/setMp3Voice':
      return {
        ...state,
        voiceWorkflow: {
          ...state.voiceWorkflow,
          mp3Voice: action.voice
        }
      };
    default:
      return state;
  }
}

const AppStateContext = createContext<CentralAppState | null>(null);
const AppDispatchContext = createContext<Dispatch<AppAction> | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const dispatchValue = useMemo(() => dispatch, [dispatch]);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatchValue}>{children}</AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppDispatch() {
  const dispatch = useContext(AppDispatchContext);
  if (!dispatch) {
    throw new Error('useAppDispatch must be used inside AppStateProvider');
  }
  return dispatch;
}

export function useAppSelector<T>(selector: (state: CentralAppState) => T): T {
  const state = useContext(AppStateContext);
  if (!state) {
    throw new Error('useAppSelector must be used inside AppStateProvider');
  }
  return selector(state);
}

export const selectModalOpen = (modal: SimpleModal) => (state: CentralAppState) => state.ui.modals[modal];
export const selectBookCardOpen = (state: CentralAppState) => state.ui.modals.bookCard;
export const selectBookCardBookId = (state: CentralAppState) => state.ui.bookCardBookId;
export const selectFullscreen = (state: CentralAppState) => state.ui.fullscreen;
export const selectToast = (state: CentralAppState) => state.ui.toast;
export const selectImagePreview = (state: CentralAppState) => state.ui.imagePreview;
export const selectEditorState = (state: CentralAppState) => state.ui.editor;
export const selectSettingsToolbarTab = (state: CentralAppState) => state.ui.settingsToolbar.activeTab;
export const selectNavigationState = (state: CentralAppState) => state.navigation;
export const selectPageNavigationRequest = (state: CentralAppState) => state.pageNavigationRequest;
export const selectDashboardNavigationRequest = (state: CentralAppState) => state.dashboardNavigationRequest;
export const selectStreamControlRequest = (state: CentralAppState) => state.streamControlRequest;
export const selectReaderSession = (state: CentralAppState) => state.readerSession;
export const selectBookSessionWorkflow = (state: CentralAppState) => state.bookSessionWorkflow;
export const selectAudioState = (state: CentralAppState) => state.audio;
export const selectChapterVersionNavigationRequest = (state: CentralAppState) =>
  state.chapterVersionNavigationRequest;
export const selectChapterTextContext = (state: CentralAppState) => state.chapterTextContext;
export const selectRefreshTokens = (state: CentralAppState) => state.refreshTokens;
export const selectReaderPreferences = (state: CentralAppState) => state.readerPreferences;
export const selectStreamUiControls = (state: CentralAppState) => state.streamUiControls;
export const selectUnitWorkflow = (state: CentralAppState) => state.unitWorkflow;
export const selectOcrEdit = (state: CentralAppState) => state.ocrEdit;
export const selectFloatingAudio = (state: CentralAppState) => state.floatingAudio;
export const selectPrintWorkflow = (state: CentralAppState) => state.printWorkflow;
export const selectTocWorkflow = (state: CentralAppState) => state.tocWorkflow;
export const selectSearchWorkflow = (state: CentralAppState) => state.searchWorkflow;
export const selectBookmarkWorkflow = (state: CentralAppState) => state.bookmarkWorkflow;
export const selectQuizWorkflow = (modal: QuizModal) => (state: CentralAppState) => state.quizWorkflow[modal];
export const selectVocabularyWorkflow = (state: CentralAppState) => state.vocabularyWorkflow;
export const selectMemoryCardWorkflow = (state: CentralAppState) => state.memoryCardWorkflow;
export const selectPageTextWorkflow = (state: CentralAppState) => state.pageTextWorkflow;
export const selectImagePreviewWorkflow = (state: CentralAppState) => state.imagePreviewWorkflow;
export const selectViewerWorkflow = (state: CentralAppState) => state.viewerWorkflow;
export const selectVoiceWorkflow = (state: CentralAppState) => state.voiceWorkflow;
