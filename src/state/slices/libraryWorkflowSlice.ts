import type {
  BookCard,
  BookCardUpdate,
  ChapterTextPrompt,
  ListeningDashboardData
} from '@/types/app';
import type {
  BookCardWorkflowState,
  ListeningDashboardWorkflowState,
  PromptEditorWorkflowState
} from '@/state/appState';

export type LibraryWorkflowState = {
  bookCardWorkflow: BookCardWorkflowState;
  promptEditorWorkflow: PromptEditorWorkflowState;
  listeningDashboardWorkflow: ListeningDashboardWorkflowState;
};

export type LibraryWorkflowAction =
  | { type: 'bookCardWorkflow/loadCards' }
  | { type: 'bookCardWorkflow/setCards'; cardsByBook: Record<string, BookCard> }
  | { type: 'bookCardWorkflow/setCardsLoading'; loading: boolean }
  | { type: 'bookCardWorkflow/setCardsError'; error: string | null }
  | { type: 'bookCardWorkflow/loadEditorCard'; bookId: string }
  | { type: 'bookCardWorkflow/setEditorCard'; card: BookCard | null }
  | { type: 'bookCardWorkflow/setEditorLoading'; loading: boolean }
  | { type: 'bookCardWorkflow/setEditorSaving'; saving: boolean }
  | { type: 'bookCardWorkflow/setEditorError'; error: string | null }
  | { type: 'bookCardWorkflow/saveEditorCard'; bookId: string; card: BookCardUpdate }
  | { type: 'promptEditorWorkflow/setPrompts'; prompts: ChapterTextPrompt[]; selectedId?: string }
  | { type: 'promptEditorWorkflow/setSelectedId'; selectedId: string }
  | { type: 'promptEditorWorkflow/setLoading'; loading: boolean }
  | { type: 'promptEditorWorkflow/setSaving'; saving: boolean }
  | { type: 'promptEditorWorkflow/setError'; error: string | null }
  | { type: 'promptEditorWorkflow/setStatus'; status: string | null }
  | { type: 'listeningDashboardWorkflow/load' }
  | { type: 'listeningDashboardWorkflow/setData'; data: ListeningDashboardData | null }
  | { type: 'listeningDashboardWorkflow/setLoading'; loading: boolean }
  | { type: 'listeningDashboardWorkflow/setError'; error: string | null };

const LIBRARY_WORKFLOW_ACTION_TYPES = new Set<LibraryWorkflowAction['type']>([
  'bookCardWorkflow/loadCards',
  'bookCardWorkflow/setCards',
  'bookCardWorkflow/setCardsLoading',
  'bookCardWorkflow/setCardsError',
  'bookCardWorkflow/loadEditorCard',
  'bookCardWorkflow/setEditorCard',
  'bookCardWorkflow/setEditorLoading',
  'bookCardWorkflow/setEditorSaving',
  'bookCardWorkflow/setEditorError',
  'bookCardWorkflow/saveEditorCard',
  'promptEditorWorkflow/setPrompts',
  'promptEditorWorkflow/setSelectedId',
  'promptEditorWorkflow/setLoading',
  'promptEditorWorkflow/setSaving',
  'promptEditorWorkflow/setError',
  'promptEditorWorkflow/setStatus',
  'listeningDashboardWorkflow/load',
  'listeningDashboardWorkflow/setData',
  'listeningDashboardWorkflow/setLoading',
  'listeningDashboardWorkflow/setError'
]);

export const initialLibraryWorkflowState: LibraryWorkflowState = {
  bookCardWorkflow: {
    cardsByBook: {},
    cardsLoading: false,
    cardsError: null,
    cardsRefreshRequestId: 0,
    editor: {
      card: null,
      loading: false,
      saving: false,
      error: null,
      loadRequest: null,
      saveRequest: null
    }
  },
  promptEditorWorkflow: {
    prompts: [],
    selectedId: '',
    loading: false,
    saving: false,
    error: null,
    status: null
  },
  listeningDashboardWorkflow: { data: null, loading: false, error: null, refreshRequestId: 0 }
};

function createDefaultEditorBookCard(bookId: string): BookCard {
  return {
    book: bookId,
    title: bookId,
    author: '',
    category: '',
    coverImage: null,
    defaultCoverImage: null,
    bookType: 'image'
  };
}

export const libraryWorkflowActions = {
  loadBookCards: () => ({ type: 'bookCardWorkflow/loadCards' as const }),
  setBookCards: (cardsByBook: Record<string, BookCard>) => ({ type: 'bookCardWorkflow/setCards' as const, cardsByBook }),
  setBookCardsLoading: (loading: boolean) => ({ type: 'bookCardWorkflow/setCardsLoading' as const, loading }),
  setBookCardsError: (error: string | null) => ({ type: 'bookCardWorkflow/setCardsError' as const, error }),
  loadBookCardEditor: (bookId: string) => ({ type: 'bookCardWorkflow/loadEditorCard' as const, bookId }),
  setBookCardEditorCard: (card: BookCard | null) => ({ type: 'bookCardWorkflow/setEditorCard' as const, card }),
  setBookCardEditorLoading: (loading: boolean) => ({ type: 'bookCardWorkflow/setEditorLoading' as const, loading }),
  setBookCardEditorSaving: (saving: boolean) => ({ type: 'bookCardWorkflow/setEditorSaving' as const, saving }),
  setBookCardEditorError: (error: string | null) => ({ type: 'bookCardWorkflow/setEditorError' as const, error }),
  saveBookCardEditor: (bookId: string, card: BookCardUpdate) => ({ type: 'bookCardWorkflow/saveEditorCard' as const, bookId, card }),
  setPromptEditorPrompts: (prompts: ChapterTextPrompt[], selectedId?: string) => ({ type: 'promptEditorWorkflow/setPrompts' as const, prompts, selectedId }),
  setPromptEditorSelectedId: (selectedId: string) => ({ type: 'promptEditorWorkflow/setSelectedId' as const, selectedId }),
  setPromptEditorLoading: (loading: boolean) => ({ type: 'promptEditorWorkflow/setLoading' as const, loading }),
  setPromptEditorSaving: (saving: boolean) => ({ type: 'promptEditorWorkflow/setSaving' as const, saving }),
  setPromptEditorError: (error: string | null) => ({ type: 'promptEditorWorkflow/setError' as const, error }),
  setPromptEditorStatus: (status: string | null) => ({ type: 'promptEditorWorkflow/setStatus' as const, status }),
  loadListeningDashboard: () => ({ type: 'listeningDashboardWorkflow/load' as const }),
  setListeningDashboardData: (data: ListeningDashboardData | null) => ({ type: 'listeningDashboardWorkflow/setData' as const, data }),
  setListeningDashboardLoading: (loading: boolean) => ({ type: 'listeningDashboardWorkflow/setLoading' as const, loading }),
  setListeningDashboardError: (error: string | null) => ({ type: 'listeningDashboardWorkflow/setError' as const, error })
};

export function isLibraryWorkflowAction(action: { type: string }): action is LibraryWorkflowAction {
  return LIBRARY_WORKFLOW_ACTION_TYPES.has(action.type as LibraryWorkflowAction['type']);
}

export function reduceLibraryWorkflow(
  state: LibraryWorkflowState,
  action: LibraryWorkflowAction
): LibraryWorkflowState {
  switch (action.type) {
    case 'bookCardWorkflow/loadCards':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, cardsRefreshRequestId: state.bookCardWorkflow.cardsRefreshRequestId + 1 } };
    case 'bookCardWorkflow/setCards':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, cardsByBook: action.cardsByBook } };
    case 'bookCardWorkflow/setCardsLoading':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, cardsLoading: action.loading } };
    case 'bookCardWorkflow/setCardsError':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, cardsError: action.error } };
    case 'bookCardWorkflow/loadEditorCard':
      return {
        ...state,
        bookCardWorkflow: {
          ...state.bookCardWorkflow,
          editor: {
            ...state.bookCardWorkflow.editor,
            card: createDefaultEditorBookCard(action.bookId),
            error: null,
            loadRequest: { id: (state.bookCardWorkflow.editor.loadRequest?.id ?? 0) + 1, bookId: action.bookId }
          }
        }
      };
    case 'bookCardWorkflow/setEditorCard':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, editor: { ...state.bookCardWorkflow.editor, card: action.card } } };
    case 'bookCardWorkflow/setEditorLoading':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, editor: { ...state.bookCardWorkflow.editor, loading: action.loading } } };
    case 'bookCardWorkflow/setEditorSaving':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, editor: { ...state.bookCardWorkflow.editor, saving: action.saving } } };
    case 'bookCardWorkflow/setEditorError':
      return { ...state, bookCardWorkflow: { ...state.bookCardWorkflow, editor: { ...state.bookCardWorkflow.editor, error: action.error } } };
    case 'bookCardWorkflow/saveEditorCard':
      return {
        ...state,
        bookCardWorkflow: {
          ...state.bookCardWorkflow,
          editor: {
            ...state.bookCardWorkflow.editor,
            saveRequest: { id: (state.bookCardWorkflow.editor.saveRequest?.id ?? 0) + 1, bookId: action.bookId, card: action.card }
          }
        }
      };
    case 'promptEditorWorkflow/setPrompts': {
      const selectedId = action.selectedId && action.prompts.some((prompt) => prompt.id === action.selectedId)
        ? action.selectedId
        : state.promptEditorWorkflow.selectedId && action.prompts.some((prompt) => prompt.id === state.promptEditorWorkflow.selectedId)
        ? state.promptEditorWorkflow.selectedId
        : action.prompts[0]?.id ?? '';
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, prompts: action.prompts, selectedId } };
    }
    case 'promptEditorWorkflow/setSelectedId':
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, selectedId: action.selectedId } };
    case 'promptEditorWorkflow/setLoading':
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, loading: action.loading } };
    case 'promptEditorWorkflow/setSaving':
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, saving: action.saving } };
    case 'promptEditorWorkflow/setError':
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, error: action.error } };
    case 'promptEditorWorkflow/setStatus':
      return { ...state, promptEditorWorkflow: { ...state.promptEditorWorkflow, status: action.status } };
    case 'listeningDashboardWorkflow/load':
      return { ...state, listeningDashboardWorkflow: { ...state.listeningDashboardWorkflow, refreshRequestId: state.listeningDashboardWorkflow.refreshRequestId + 1 } };
    case 'listeningDashboardWorkflow/setData':
      return { ...state, listeningDashboardWorkflow: { ...state.listeningDashboardWorkflow, data: action.data } };
    case 'listeningDashboardWorkflow/setLoading':
      return { ...state, listeningDashboardWorkflow: { ...state.listeningDashboardWorkflow, loading: action.loading } };
    case 'listeningDashboardWorkflow/setError':
      return { ...state, listeningDashboardWorkflow: { ...state.listeningDashboardWorkflow, error: action.error } };
  }
}
