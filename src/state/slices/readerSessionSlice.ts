import type { OcrJob, OcrQueueState, PageTextOcrEngine } from '@/types/app';
import type { ViewMode } from '@/lib/appConstants';
import type {
  AppRefreshTokens,
  BookSessionWorkflowState,
  ChapterParagraph,
  ChapterTextContextState,
  ChapterVersionNavigationRequest,
  DisplayedChapterText,
  OcrEditState,
  OcrQueueWorkflowState,
  ReaderPreferencesState,
  ReaderSessionState,
  UnitWorkflowState
} from '@/state/appState';

export type ReaderSessionSliceState = {
  readerSession: ReaderSessionState;
  searchReadingPosition: ReaderSessionState | null;
  bookSessionWorkflow: BookSessionWorkflowState;
  chapterVersionNavigationRequest: ChapterVersionNavigationRequest | null;
  chapterTextContext: ChapterTextContextState;
  refreshTokens: AppRefreshTokens;
  readerPreferences: ReaderPreferencesState;
  unitWorkflow: UnitWorkflowState;
  ocrEdit: OcrEditState;
  ocrQueueWorkflow: OcrQueueWorkflowState;
};

export type ReaderSessionAction =
  | { type: 'ocrQueueWorkflow/setSnapshot'; jobs: OcrJob[]; paused: boolean; queueState: OcrQueueState }
  | { type: 'readerSession/setBookId'; bookId: string | null }
  | { type: 'readerSession/saveSearchReadingPosition' }
  | { type: 'readerSession/clearSearchReadingPosition' }
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
  | { type: 'chapterVersionNavigation/request'; chapterNumber: number; versionId: string }
  | { type: 'chapterVersionNavigation/clear' }
  | { type: 'chapterText/setDisplayed'; displayedChapterText: DisplayedChapterText | null }
  | { type: 'chapterText/setFirstParagraph'; firstChapterParagraph: ChapterParagraph | null }
  | { type: 'refresh/chapterView' }
  | { type: 'refresh/bookCards' }
  | { type: 'preferences/setPageTextOcrEngine'; engine: PageTextOcrEngine }
  | { type: 'preferences/setQuizAutoPlayEnabled'; enabled: boolean }
  | { type: 'unitWorkflow/refresh' }
  | { type: 'unitWorkflow/setQuizLabel'; label: string }
  | { type: 'unitWorkflow/setCreating'; creating: boolean }
  | { type: 'ocrEdit/setMode'; enabled: boolean }
  | { type: 'ocrEdit/setSaving'; saving: boolean };

const READER_SESSION_ACTION_TYPES = new Set<ReaderSessionAction['type']>([
  'ocrQueueWorkflow/setSnapshot',
  'readerSession/setBookId',
  'readerSession/saveSearchReadingPosition',
  'readerSession/clearSearchReadingPosition',
  'readerSession/setCurrentPage',
  'readerSession/setViewMode',
  'bookSessionWorkflow/setBooks',
  'bookSessionWorkflow/setManifest',
  'bookSessionWorkflow/setBookType',
  'bookSessionWorkflow/setChapterCount',
  'bookSessionWorkflow/setLoading',
  'bookSessionWorkflow/setUploadingChapter',
  'bookSessionWorkflow/setDeletingChapter',
  'bookSessionWorkflow/setUploadingPdf',
  'bookSessionWorkflow/setLibraryStateReady',
  'chapterVersionNavigation/request',
  'chapterVersionNavigation/clear',
  'chapterText/setDisplayed',
  'chapterText/setFirstParagraph',
  'refresh/chapterView',
  'refresh/bookCards',
  'preferences/setPageTextOcrEngine',
  'preferences/setQuizAutoPlayEnabled',
  'unitWorkflow/refresh',
  'unitWorkflow/setQuizLabel',
  'unitWorkflow/setCreating',
  'ocrEdit/setMode',
  'ocrEdit/setSaving'
]);

function getInitialReaderSession(): ReaderSessionState {
  if (typeof window === 'undefined') {
    return { bookId: null, currentPage: 0, viewMode: 'pages' };
  }
  const book = new URLSearchParams(window.location.search).get('book')?.trim();
  return { bookId: book || null, currentPage: 0, viewMode: 'pages' };
}

export function createInitialReaderSessionState(): ReaderSessionSliceState {
  return {
    readerSession: getInitialReaderSession(),
    searchReadingPosition: null,
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
    chapterVersionNavigationRequest: null,
    chapterTextContext: { displayedChapterText: null, firstChapterParagraph: null },
    refreshTokens: { chapterView: 0, bookCards: 0 },
    readerPreferences: { pageTextOcrEngine: 'deepseek_ocr', quizAutoPlayEnabled: true },
    unitWorkflow: { refreshToken: 0, quizLabel: 'Topic', creating: false },
    ocrEdit: { editMode: false, saving: false },
    ocrQueueWorkflow: {
      jobs: [],
      paused: false,
      queueState: { total: 0, processed: 0, failed: 0, running: false, paused: false }
    }
  };
}

export const readerSessionActions = {
  saveSearchReadingPosition: () => ({ type: 'readerSession/saveSearchReadingPosition' as const }),
  clearSearchReadingPosition: () => ({ type: 'readerSession/clearSearchReadingPosition' as const }),
  setOcrQueueSnapshot: (payload: { jobs: OcrJob[]; paused: boolean; queueState: OcrQueueState }) => ({
    type: 'ocrQueueWorkflow/setSnapshot' as const,
    ...payload
  }),
  setReaderBookId: (bookId: string | null) => ({ type: 'readerSession/setBookId' as const, bookId }),
  setReaderCurrentPage: (page: number) => ({ type: 'readerSession/setCurrentPage' as const, page }),
  setReaderViewMode: (mode: ViewMode) => ({ type: 'readerSession/setViewMode' as const, mode }),
  setBookSessionBooks: (books: string[]) => ({ type: 'bookSessionWorkflow/setBooks' as const, books }),
  setBookSessionManifest: (manifest: string[]) => ({ type: 'bookSessionWorkflow/setManifest' as const, manifest }),
  setBookSessionBookType: (bookType: 'image' | 'text') => ({ type: 'bookSessionWorkflow/setBookType' as const, bookType }),
  setBookSessionChapterCount: (chapterCount: number) => ({ type: 'bookSessionWorkflow/setChapterCount' as const, chapterCount }),
  setBookSessionLoading: (loading: boolean) => ({ type: 'bookSessionWorkflow/setLoading' as const, loading }),
  setBookSessionUploadingChapter: (uploading: boolean) => ({ type: 'bookSessionWorkflow/setUploadingChapter' as const, uploading }),
  setBookSessionDeletingChapter: (deleting: boolean) => ({ type: 'bookSessionWorkflow/setDeletingChapter' as const, deleting }),
  setBookSessionUploadingPdf: (uploading: boolean) => ({ type: 'bookSessionWorkflow/setUploadingPdf' as const, uploading }),
  setBookSessionLibraryStateReady: (ready: boolean) => ({ type: 'bookSessionWorkflow/setLibraryStateReady' as const, ready }),
  requestChapterVersionNavigation: (chapterNumber: number, versionId: string) => ({ type: 'chapterVersionNavigation/request' as const, chapterNumber, versionId }),
  clearChapterVersionNavigation: () => ({ type: 'chapterVersionNavigation/clear' as const }),
  setDisplayedChapterText: (displayedChapterText: DisplayedChapterText | null) => ({ type: 'chapterText/setDisplayed' as const, displayedChapterText }),
  setFirstChapterParagraph: (firstChapterParagraph: ChapterParagraph | null) => ({ type: 'chapterText/setFirstParagraph' as const, firstChapterParagraph }),
  refreshChapterView: () => ({ type: 'refresh/chapterView' as const }),
  refreshBookCards: () => ({ type: 'refresh/bookCards' as const }),
  setPageTextOcrEngine: (engine: PageTextOcrEngine) => ({ type: 'preferences/setPageTextOcrEngine' as const, engine }),
  setQuizAutoPlayEnabled: (enabled: boolean) => ({ type: 'preferences/setQuizAutoPlayEnabled' as const, enabled }),
  refreshUnits: () => ({ type: 'unitWorkflow/refresh' as const }),
  setUnitQuizLabel: (label: string) => ({ type: 'unitWorkflow/setQuizLabel' as const, label }),
  setUnitCreating: (creating: boolean) => ({ type: 'unitWorkflow/setCreating' as const, creating }),
  setOcrEditMode: (enabled: boolean) => ({ type: 'ocrEdit/setMode' as const, enabled }),
  setOcrEditSaving: (saving: boolean) => ({ type: 'ocrEdit/setSaving' as const, saving })
};

export function isReaderSessionAction(action: { type: string }): action is ReaderSessionAction {
  return READER_SESSION_ACTION_TYPES.has(action.type as ReaderSessionAction['type']);
}

export function reduceReaderSession(
  state: ReaderSessionSliceState,
  action: ReaderSessionAction
): ReaderSessionSliceState {
  switch (action.type) {
    case 'ocrQueueWorkflow/setSnapshot':
      return { ...state, ocrQueueWorkflow: { jobs: action.jobs, paused: action.paused, queueState: action.queueState } };
    case 'readerSession/setBookId':
      return {
        ...state,
        readerSession: { ...state.readerSession, bookId: action.bookId },
        searchReadingPosition: action.bookId === state.readerSession.bookId
          ? state.searchReadingPosition
          : null
      };
    case 'readerSession/saveSearchReadingPosition':
      if (!state.readerSession.bookId || state.searchReadingPosition) {
        return state;
      }
      return { ...state, searchReadingPosition: { ...state.readerSession } };
    case 'readerSession/clearSearchReadingPosition':
      return { ...state, searchReadingPosition: null };
    case 'readerSession/setCurrentPage':
      return { ...state, readerSession: { ...state.readerSession, currentPage: action.page } };
    case 'readerSession/setViewMode':
      return { ...state, readerSession: { ...state.readerSession, viewMode: action.mode } };
    case 'bookSessionWorkflow/setBooks':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, books: action.books } };
    case 'bookSessionWorkflow/setManifest':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, manifest: action.manifest } };
    case 'bookSessionWorkflow/setBookType':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, bookType: action.bookType } };
    case 'bookSessionWorkflow/setChapterCount':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, chapterCount: action.chapterCount } };
    case 'bookSessionWorkflow/setLoading':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, loading: action.loading } };
    case 'bookSessionWorkflow/setUploadingChapter':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, uploadingChapter: action.uploading } };
    case 'bookSessionWorkflow/setDeletingChapter':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, deletingChapter: action.deleting } };
    case 'bookSessionWorkflow/setUploadingPdf':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, uploadingPdf: action.uploading } };
    case 'bookSessionWorkflow/setLibraryStateReady':
      return { ...state, bookSessionWorkflow: { ...state.bookSessionWorkflow, libraryStateReady: action.ready } };
    case 'chapterVersionNavigation/request':
      return { ...state, chapterVersionNavigationRequest: { id: (state.chapterVersionNavigationRequest?.id ?? 0) + 1, chapterNumber: action.chapterNumber, versionId: action.versionId } };
    case 'chapterVersionNavigation/clear':
      return { ...state, chapterVersionNavigationRequest: null };
    case 'chapterText/setDisplayed':
      return { ...state, chapterTextContext: { ...state.chapterTextContext, displayedChapterText: action.displayedChapterText } };
    case 'chapterText/setFirstParagraph':
      return { ...state, chapterTextContext: { ...state.chapterTextContext, firstChapterParagraph: action.firstChapterParagraph } };
    case 'refresh/chapterView':
      return { ...state, refreshTokens: { ...state.refreshTokens, chapterView: state.refreshTokens.chapterView + 1 } };
    case 'refresh/bookCards':
      return { ...state, refreshTokens: { ...state.refreshTokens, bookCards: state.refreshTokens.bookCards + 1 } };
    case 'preferences/setPageTextOcrEngine':
      return { ...state, readerPreferences: { ...state.readerPreferences, pageTextOcrEngine: action.engine } };
    case 'preferences/setQuizAutoPlayEnabled':
      return { ...state, readerPreferences: { ...state.readerPreferences, quizAutoPlayEnabled: action.enabled } };
    case 'unitWorkflow/refresh':
      return { ...state, unitWorkflow: { ...state.unitWorkflow, refreshToken: state.unitWorkflow.refreshToken + 1 } };
    case 'unitWorkflow/setQuizLabel':
      return { ...state, unitWorkflow: { ...state.unitWorkflow, quizLabel: action.label } };
    case 'unitWorkflow/setCreating':
      return { ...state, unitWorkflow: { ...state.unitWorkflow, creating: action.creating } };
    case 'ocrEdit/setMode':
      return { ...state, ocrEdit: { ...state.ocrEdit, editMode: action.enabled } };
    case 'ocrEdit/setSaving':
      return { ...state, ocrEdit: { ...state.ocrEdit, saving: action.saving } };
  }
}
