import type {
  BookmarkWorkflowState,
  ImagePreviewWorkflowState,
  PageTextWorkflowState,
  SearchWorkflowState
} from '@/state/appState';
import type { Bookmark, PageText, SearchResult } from '@/types/app';

export type ContentWorkflowState = {
  searchWorkflow: SearchWorkflowState;
  bookmarkWorkflow: BookmarkWorkflowState;
  pageTextWorkflow: PageTextWorkflowState;
  imagePreviewWorkflow: ImagePreviewWorkflowState;
};

export type ContentWorkflowAction =
  | { type: 'searchWorkflow/reset' }
  | { type: 'searchWorkflow/setQuery'; query: string }
  | { type: 'searchWorkflow/setResults'; results: SearchResult[] }
  | { type: 'searchWorkflow/setLoading'; loading: boolean }
  | { type: 'bookmarkWorkflow/reset' }
  | { type: 'bookmarkWorkflow/setItems'; items: Bookmark[] }
  | { type: 'bookmarkWorkflow/setLoading'; loading: boolean }
  | { type: 'pageTextWorkflow/reset' }
  | { type: 'pageTextWorkflow/setEntry'; image: string; entry: PageText }
  | { type: 'pageTextWorkflow/setLoading'; loading: boolean }
  | { type: 'pageTextWorkflow/setSaving'; saving: boolean }
  | { type: 'pageTextWorkflow/setRegenerated'; regenerated: boolean }
  | { type: 'imagePreviewWorkflow/resetStatus' }
  | { type: 'imagePreviewWorkflow/setEnhancedUrl'; key: string; url: string | null }
  | { type: 'imagePreviewWorkflow/setEnhancing'; enhancing: boolean }
  | { type: 'imagePreviewWorkflow/setError'; error: string | null };

const CONTENT_WORKFLOW_ACTION_TYPES = new Set<ContentWorkflowAction['type']>([
  'searchWorkflow/reset',
  'searchWorkflow/setQuery',
  'searchWorkflow/setResults',
  'searchWorkflow/setLoading',
  'bookmarkWorkflow/reset',
  'bookmarkWorkflow/setItems',
  'bookmarkWorkflow/setLoading',
  'pageTextWorkflow/reset',
  'pageTextWorkflow/setEntry',
  'pageTextWorkflow/setLoading',
  'pageTextWorkflow/setSaving',
  'pageTextWorkflow/setRegenerated',
  'imagePreviewWorkflow/resetStatus',
  'imagePreviewWorkflow/setEnhancedUrl',
  'imagePreviewWorkflow/setEnhancing',
  'imagePreviewWorkflow/setError'
]);

export const initialContentWorkflowState: ContentWorkflowState = {
  searchWorkflow: {
    query: '',
    results: [],
    loading: false
  },
  bookmarkWorkflow: {
    items: [],
    loading: false
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
  }
};

export const contentWorkflowActions = {
  resetSearch: () => ({ type: 'searchWorkflow/reset' as const }),
  setSearchQuery: (query: string) => ({ type: 'searchWorkflow/setQuery' as const, query }),
  setSearchResults: (results: SearchResult[]) => ({
    type: 'searchWorkflow/setResults' as const,
    results
  }),
  setSearchLoading: (loading: boolean) => ({ type: 'searchWorkflow/setLoading' as const, loading }),
  resetBookmarks: () => ({ type: 'bookmarkWorkflow/reset' as const }),
  setBookmarks: (items: Bookmark[]) => ({ type: 'bookmarkWorkflow/setItems' as const, items }),
  setBookmarksLoading: (loading: boolean) => ({
    type: 'bookmarkWorkflow/setLoading' as const,
    loading
  }),
  resetPageText: () => ({ type: 'pageTextWorkflow/reset' as const }),
  setPageTextEntry: (image: string, entry: PageText) => ({
    type: 'pageTextWorkflow/setEntry' as const,
    image,
    entry
  }),
  setPageTextLoading: (loading: boolean) => ({
    type: 'pageTextWorkflow/setLoading' as const,
    loading
  }),
  setPageTextSaving: (saving: boolean) => ({
    type: 'pageTextWorkflow/setSaving' as const,
    saving
  }),
  setRegeneratedPageText: (regenerated: boolean) => ({
    type: 'pageTextWorkflow/setRegenerated' as const,
    regenerated
  }),
  resetImagePreviewStatus: () => ({ type: 'imagePreviewWorkflow/resetStatus' as const }),
  setImagePreviewCachedEnhancedUrl: (key: string, url: string | null) => ({
    type: 'imagePreviewWorkflow/setEnhancedUrl' as const,
    key,
    url
  }),
  setImagePreviewEnhancing: (enhancing: boolean) => ({
    type: 'imagePreviewWorkflow/setEnhancing' as const,
    enhancing
  }),
  setImagePreviewError: (error: string | null) => ({
    type: 'imagePreviewWorkflow/setError' as const,
    error
  })
};

export function isContentWorkflowAction(action: { type: string }): action is ContentWorkflowAction {
  return CONTENT_WORKFLOW_ACTION_TYPES.has(action.type as ContentWorkflowAction['type']);
}

export function reduceContentWorkflow(
  state: ContentWorkflowState,
  action: ContentWorkflowAction
): ContentWorkflowState {
  switch (action.type) {
    case 'searchWorkflow/reset':
      return { ...state, searchWorkflow: initialContentWorkflowState.searchWorkflow };
    case 'searchWorkflow/setQuery':
      return { ...state, searchWorkflow: { ...state.searchWorkflow, query: action.query } };
    case 'searchWorkflow/setResults':
      return { ...state, searchWorkflow: { ...state.searchWorkflow, results: action.results } };
    case 'searchWorkflow/setLoading':
      return { ...state, searchWorkflow: { ...state.searchWorkflow, loading: action.loading } };
    case 'bookmarkWorkflow/reset':
      return { ...state, bookmarkWorkflow: initialContentWorkflowState.bookmarkWorkflow };
    case 'bookmarkWorkflow/setItems':
      return { ...state, bookmarkWorkflow: { ...state.bookmarkWorkflow, items: action.items } };
    case 'bookmarkWorkflow/setLoading':
      return { ...state, bookmarkWorkflow: { ...state.bookmarkWorkflow, loading: action.loading } };
    case 'pageTextWorkflow/reset':
      return { ...state, pageTextWorkflow: initialContentWorkflowState.pageTextWorkflow };
    case 'pageTextWorkflow/setEntry':
      return {
        ...state,
        pageTextWorkflow: {
          ...state.pageTextWorkflow,
          cache: { ...state.pageTextWorkflow.cache, [action.image]: action.entry }
        }
      };
    case 'pageTextWorkflow/setLoading':
      return { ...state, pageTextWorkflow: { ...state.pageTextWorkflow, loading: action.loading } };
    case 'pageTextWorkflow/setSaving':
      return { ...state, pageTextWorkflow: { ...state.pageTextWorkflow, saving: action.saving } };
    case 'pageTextWorkflow/setRegenerated':
      return {
        ...state,
        pageTextWorkflow: { ...state.pageTextWorkflow, regenerated: action.regenerated }
      };
    case 'imagePreviewWorkflow/resetStatus':
      return {
        ...state,
        imagePreviewWorkflow: { ...state.imagePreviewWorkflow, enhancing: false, error: null }
      };
    case 'imagePreviewWorkflow/setEnhancedUrl': {
      const enhancedUrls = { ...state.imagePreviewWorkflow.enhancedUrls };
      if (action.url) {
        enhancedUrls[action.key] = action.url;
      } else {
        delete enhancedUrls[action.key];
      }
      return {
        ...state,
        imagePreviewWorkflow: { ...state.imagePreviewWorkflow, enhancedUrls }
      };
    }
    case 'imagePreviewWorkflow/setEnhancing':
      return {
        ...state,
        imagePreviewWorkflow: { ...state.imagePreviewWorkflow, enhancing: action.enhancing }
      };
    case 'imagePreviewWorkflow/setError':
      return {
        ...state,
        imagePreviewWorkflow: { ...state.imagePreviewWorkflow, error: action.error }
      };
  }
}
