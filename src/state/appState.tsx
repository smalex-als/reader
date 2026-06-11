import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode
} from 'react';
import type { MainView, ViewMode } from '@/lib/appConstants';
import type { ImagePreviewTarget, PageTextOcrEngine } from '@/types/app';

export type AppToolbarTab = 'image' | 'study' | 'tools';

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

export interface ReaderSessionState {
  bookId: string | null;
  currentPage: number;
  viewMode: ViewMode;
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

export interface CentralAppState {
  ui: AppUiState;
  navigation: AppNavigationState;
  readerSession: ReaderSessionState;
  chapterVersionNavigationRequest: ChapterVersionNavigationRequest | null;
  chapterTextContext: ChapterTextContextState;
  refreshTokens: AppRefreshTokens;
  readerPreferences: ReaderPreferencesState;
  streamUiControls: StreamUiControlsState;
}

export type AppAction =
  | { type: 'modal/open'; modal: SimpleModal }
  | { type: 'modal/close'; modal: SimpleModal }
  | { type: 'modal/setOpen'; modal: SimpleModal; open: boolean }
  | { type: 'bookCard/open'; bookId: string }
  | { type: 'bookCard/close' }
  | { type: 'bookCard/setOpen'; open: boolean }
  | { type: 'bookCard/setBookId'; bookId: string | null }
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
  | { type: 'readerSession/setBookId'; bookId: string | null }
  | { type: 'readerSession/setCurrentPage'; page: number }
  | { type: 'readerSession/setViewMode'; mode: ViewMode }
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
  | { type: 'streamUi/setPlaybackRate'; rate: number };

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
  readerSession: getInitialReaderSession(),
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
  setPlaybackRate: (rate: number): AppAction => ({ type: 'streamUi/setPlaybackRate', rate })
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
export const selectImagePreview = (state: CentralAppState) => state.ui.imagePreview;
export const selectEditorState = (state: CentralAppState) => state.ui.editor;
export const selectSettingsToolbarTab = (state: CentralAppState) => state.ui.settingsToolbar.activeTab;
export const selectNavigationState = (state: CentralAppState) => state.navigation;
export const selectReaderSession = (state: CentralAppState) => state.readerSession;
export const selectChapterVersionNavigationRequest = (state: CentralAppState) =>
  state.chapterVersionNavigationRequest;
export const selectChapterTextContext = (state: CentralAppState) => state.chapterTextContext;
export const selectRefreshTokens = (state: CentralAppState) => state.refreshTokens;
export const selectReaderPreferences = (state: CentralAppState) => state.readerPreferences;
export const selectStreamUiControls = (state: CentralAppState) => state.streamUiControls;
