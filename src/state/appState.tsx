import {
  createContext,
  useContext,
  useRef,
  type Dispatch,
  type ReactNode
} from 'react';
import {
  type MainView,
  type StreamVoice,
  type StreamVoiceOption,
  type ViewMode
} from '@/lib/appConstants';
import type {
  AppSettings,
  AudioState,
  Bookmark,
  BookCard,
  BookCardUpdate,
  ChapterMemoryCard,
  ChapterTextPrompt,
  ChapterTextVersion,
  ChapterVocabulary,
  ImagePreviewTarget,
  ListeningDashboardData,
  OcrJob,
  OcrQueueState,
  PageText,
  PageTextOcrEngine,
  Quiz,
  SearchResult,
  TocEntry,
  ToastMessage,
  ViewerMetrics
} from '@/types/app';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';
import {
  createSelectorStore,
  useStoreSelector,
  type EqualityFn,
  type SelectorStore
} from '@/state/createSelectorStore';
import { StreamRuntimeProvider } from '@/state/streamRuntimeStore';
import {
  contentWorkflowActions,
  initialContentWorkflowState,
  isContentWorkflowAction,
  reduceContentWorkflow,
  type ContentWorkflowAction
} from '@/state/slices/contentWorkflowSlice';
import {
  createInitialNavigationState,
  isNavigationAction,
  navigationActions,
  reduceNavigation,
  type NavigationAction
} from '@/state/slices/navigationSlice';
import {
  initialUiState,
  isUiAction,
  reduceUiState,
  uiActions,
  type UiAction
} from '@/state/slices/uiSlice';
import {
  initialStreamUiState,
  isStreamUiAction,
  reduceStreamUiState,
  streamUiActions,
  type StreamUiAction
} from '@/state/slices/streamUiSlice';
import {
  initialStudyWorkflowState,
  isStudyWorkflowAction,
  reduceStudyWorkflow,
  studyWorkflowActions,
  type StudyWorkflowAction
} from '@/state/slices/studyWorkflowSlice';
import {
  createInitialReaderSessionState,
  isReaderSessionAction,
  readerSessionActions,
  reduceReaderSession,
  type ReaderSessionAction
} from '@/state/slices/readerSessionSlice';
import {
  createInitialMediaPreferencesState,
  isMediaPreferencesAction,
  mediaPreferencesActions,
  reduceMediaPreferences,
  type MediaPreferencesAction
} from '@/state/slices/mediaPreferencesSlice';
import {
  chapterToolsActions,
  initialChapterToolsState,
  isChapterToolsAction,
  reduceChapterTools,
  type ChapterToolsAction
} from '@/state/slices/chapterToolsSlice';
import {
  initialLibraryWorkflowState,
  isLibraryWorkflowAction,
  libraryWorkflowActions,
  reduceLibraryWorkflow,
  type LibraryWorkflowAction
} from '@/state/slices/libraryWorkflowSlice';

export type AppToolbarTab = 'image' | 'study' | 'tools';
export type TocVariant = 'main' | 'detailed';
export type QuizModal = 'chapterQuiz' | 'unitQuiz';

export type SimpleModal =
  | 'help'
  | 'listeningDashboard'
  | 'ocrQueue'
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
  | { kind: 'playNextStudyBlock' }
  | { kind: 'playOcrBlock'; imageUrl: string; startIndex: number; blockId: string }
  | { kind: 'playStudyAudioSingle'; text: string; pageKey: string }
  | { kind: 'playStudyAudioParagraph'; fullText: string; startIndex: number; key: string }
  | { kind: 'stop' }
  | { kind: 'stopAfterCurrent' }
  | { kind: 'togglePause' }
  | { kind: 'setVoice'; voice: string }
);

export type ShellControlRequest = {
  id: number;
} & (
  | { kind: 'fitWidth' }
  | { kind: 'fitHeight' }
  | { kind: 'toggleFullscreen' }
);

export type OcrEditRequest = {
  id: number;
} & (
  | { kind: 'toggleMode' }
  | { kind: 'toggleSpeechBlock'; blockId: string }
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

export interface OcrQueueWorkflowState {
  jobs: OcrJob[];
  paused: boolean;
  queueState: OcrQueueState;
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

export interface ListeningDashboardWorkflowState {
  data: ListeningDashboardData | null;
  loading: boolean;
  error: string | null;
  refreshRequestId: number;
}

export interface BookCardWorkflowState {
  cardsByBook: Record<string, BookCard>;
  cardsLoading: boolean;
  cardsError: string | null;
  cardsRefreshRequestId: number;
  editor: {
    card: BookCard | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    loadRequest: { id: number; bookId: string } | null;
    saveRequest: { id: number; bookId: string; card: BookCardUpdate } | null;
  };
}

export interface PromptEditorWorkflowState {
  prompts: ChapterTextPrompt[];
  selectedId: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  status: string | null;
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

export interface TextVersionModalWorkflowState {
  open: boolean;
  versions: ChapterTextVersion[];
  promptLibrary: ChapterTextPrompt[];
  sourceVersionId: string;
  versionModel: string;
  selectedPromptId: string;
  customPrompt: string;
  promptName: string;
  savePromptToLibrary: boolean;
  versionSaving: boolean;
  canCreateVersion: boolean;
  createRequestId: number;
}

export interface CentralAppState {
  ui: AppUiState;
  navigation: AppNavigationState;
  pageNavigationRequest: PageNavigationRequest | null;
  dashboardNavigationRequest: DashboardNavigationRequest | null;
  streamControlRequest: StreamControlRequest | null;
  shellControlRequest: ShellControlRequest | null;
  ocrEditRequest: OcrEditRequest | null;
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
  ocrQueueWorkflow: OcrQueueWorkflowState;
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
  bookCardWorkflow: BookCardWorkflowState;
  promptEditorWorkflow: PromptEditorWorkflowState;
  listeningDashboardWorkflow: ListeningDashboardWorkflowState;
  viewerWorkflow: ViewerWorkflowState;
  voiceWorkflow: VoiceWorkflowState;
  textVersionModalWorkflow: TextVersionModalWorkflowState;
}

export type AppAction =
  | UiAction
  | StreamUiAction
  | StudyWorkflowAction
  | ContentWorkflowAction
  | NavigationAction
  | ReaderSessionAction
  | MediaPreferencesAction
  | ChapterToolsAction
  | LibraryWorkflowAction;

const initialAppState: CentralAppState = {
  ui: initialUiState,
  ...createInitialNavigationState(),
  ...createInitialReaderSessionState(),
  ...createInitialMediaPreferencesState(),
  streamUiControls: initialStreamUiState,
  ...initialChapterToolsState,
  ...initialContentWorkflowState,
  ...initialStudyWorkflowState,
  ...initialLibraryWorkflowState
};

export const appActions = {
  ...uiActions,
  ...streamUiActions,
  ...studyWorkflowActions,
  ...contentWorkflowActions,
  ...navigationActions,
  ...readerSessionActions,
  ...mediaPreferencesActions,
  ...chapterToolsActions,
  ...libraryWorkflowActions
};

export function appReducer(state: CentralAppState, action: AppAction): CentralAppState {
  if (isUiAction(action)) {
    return { ...state, ui: reduceUiState(state.ui, action) };
  }
  if (isStreamUiAction(action)) {
    return { ...state, streamUiControls: reduceStreamUiState(state.streamUiControls, action) };
  }
  if (isStudyWorkflowAction(action)) {
    const studyWorkflow = reduceStudyWorkflow({
      quizWorkflow: state.quizWorkflow,
      vocabularyWorkflow: state.vocabularyWorkflow,
      memoryCardWorkflow: state.memoryCardWorkflow
    }, action);
    return { ...state, ...studyWorkflow };
  }
  if (isContentWorkflowAction(action)) {
    const contentWorkflow = reduceContentWorkflow({
      searchWorkflow: state.searchWorkflow,
      bookmarkWorkflow: state.bookmarkWorkflow,
      pageTextWorkflow: state.pageTextWorkflow,
      imagePreviewWorkflow: state.imagePreviewWorkflow
    }, action);
    return { ...state, ...contentWorkflow };
  }
  if (isNavigationAction(action)) {
    const navigation = reduceNavigation({
      navigation: state.navigation,
      pageNavigationRequest: state.pageNavigationRequest,
      dashboardNavigationRequest: state.dashboardNavigationRequest,
      streamControlRequest: state.streamControlRequest,
      shellControlRequest: state.shellControlRequest,
      ocrEditRequest: state.ocrEditRequest
    }, action);
    return { ...state, ...navigation };
  }
  if (isReaderSessionAction(action)) {
    const readerSession = reduceReaderSession({
      readerSession: state.readerSession,
      bookSessionWorkflow: state.bookSessionWorkflow,
      chapterVersionNavigationRequest: state.chapterVersionNavigationRequest,
      chapterTextContext: state.chapterTextContext,
      refreshTokens: state.refreshTokens,
      readerPreferences: state.readerPreferences,
      unitWorkflow: state.unitWorkflow,
      ocrEdit: state.ocrEdit,
      ocrQueueWorkflow: state.ocrQueueWorkflow
    }, action);
    return { ...state, ...readerSession };
  }
  if (isMediaPreferencesAction(action)) {
    const mediaPreferences = reduceMediaPreferences({
      audio: state.audio,
      floatingAudio: state.floatingAudio,
      printWorkflow: state.printWorkflow,
      viewerWorkflow: state.viewerWorkflow,
      voiceWorkflow: state.voiceWorkflow
    }, action);
    return { ...state, ...mediaPreferences };
  }
  if (isChapterToolsAction(action)) {
    const chapterTools = reduceChapterTools({
      tocWorkflow: state.tocWorkflow,
      textVersionModalWorkflow: state.textVersionModalWorkflow
    }, action);
    return { ...state, ...chapterTools };
  }
  if (isLibraryWorkflowAction(action)) {
    const libraryWorkflow = reduceLibraryWorkflow({
      bookCardWorkflow: state.bookCardWorkflow,
      promptEditorWorkflow: state.promptEditorWorkflow,
      listeningDashboardWorkflow: state.listeningDashboardWorkflow
    }, action);
    return { ...state, ...libraryWorkflow };
  }
  return state;
}

type AppStore = SelectorStore<CentralAppState> & {
  dispatch: Dispatch<AppAction>;
};

const AppStoreContext = createContext<AppStore | null>(null);

function createAppStore(): AppStore {
  const store = createSelectorStore(initialAppState);
  return {
    ...store,
    dispatch: (action) => {
      store.setState((state) => appReducer(state, action));
    }
  };
}

function useAppStore() {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('App state hooks must be used inside AppStateProvider');
  }
  return store;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppStore();
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      <StreamRuntimeProvider>{children}</StreamRuntimeProvider>
    </AppStoreContext.Provider>
  );
}

export function useAppDispatch() {
  return useAppStore().dispatch;
}

export function useAppSelector<T>(
  selector: (state: CentralAppState) => T,
  isEqual?: EqualityFn<T>
): T {
  return useStoreSelector(useAppStore(), selector, isEqual);
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
export const selectShellControlRequest = (state: CentralAppState) => state.shellControlRequest;
export const selectOcrEditRequest = (state: CentralAppState) => state.ocrEditRequest;
export const selectReaderSession = (state: CentralAppState) => state.readerSession;
export const selectBookIds = (state: CentralAppState) => state.bookSessionWorkflow.books;
export const selectBookManifest = (state: CentralAppState) => state.bookSessionWorkflow.manifest;
export const selectBookType = (state: CentralAppState) => state.bookSessionWorkflow.bookType;
export const selectBookChapterCount = (state: CentralAppState) => state.bookSessionWorkflow.chapterCount;
export const selectBookSessionLoading = (state: CentralAppState) => state.bookSessionWorkflow.loading;
export const selectBookUploadingChapter = (state: CentralAppState) =>
  state.bookSessionWorkflow.uploadingChapter;
export const selectBookDeletingChapter = (state: CentralAppState) =>
  state.bookSessionWorkflow.deletingChapter;
export const selectBookUploadingPdf = (state: CentralAppState) => state.bookSessionWorkflow.uploadingPdf;
export const selectBookLibraryStateReady = (state: CentralAppState) =>
  state.bookSessionWorkflow.libraryStateReady;
export const selectAudioState = (state: CentralAppState) => state.audio;
export const selectChapterVersionNavigationRequest = (state: CentralAppState) =>
  state.chapterVersionNavigationRequest;
export const selectChapterTextContext = (state: CentralAppState) => state.chapterTextContext;
export const selectRefreshTokens = (state: CentralAppState) => state.refreshTokens;
export const selectReaderPreferences = (state: CentralAppState) => state.readerPreferences;
export const selectStreamUiControls = (state: CentralAppState) => state.streamUiControls;
export const selectUnitWorkflow = (state: CentralAppState) => state.unitWorkflow;
export const selectOcrEdit = (state: CentralAppState) => state.ocrEdit;
export const selectOcrQueueWorkflow = (state: CentralAppState) => state.ocrQueueWorkflow;
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
export const selectBookCardWorkflow = (state: CentralAppState) => state.bookCardWorkflow;
export const selectPromptEditorWorkflow = (state: CentralAppState) => state.promptEditorWorkflow;
export const selectListeningDashboardWorkflow = (state: CentralAppState) => state.listeningDashboardWorkflow;
export const selectViewerWorkflow = (state: CentralAppState) => state.viewerWorkflow;
export const selectVoiceWorkflow = (state: CentralAppState) => state.voiceWorkflow;
export const selectTextVersionModalWorkflow = (state: CentralAppState) => state.textVersionModalWorkflow;
