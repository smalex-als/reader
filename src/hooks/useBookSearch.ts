import { useCallback, useEffect } from 'react';
import { searchBook } from '@/api/bookSearch';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  selectReaderSession,
  selectSearchWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { SearchResult } from '@/types/app';

type SearchPayloads = {
  runSearch: {
    bookId: string | null;
    query: string;
  };
};

type SearchActions = {
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  showError: (message: string) => void;
};

const searchHandlers = createActionHandlerRegistry<unknown, SearchActions, SearchPayloads>();
const { addActionHandler } = searchHandlers;

addActionHandler('runSearch', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    actions.showError('Select a book before searching');
    return;
  }
  const trimmed = payload.query.trim();
  actions.setQuery(payload.query);
  if (!trimmed) {
    actions.setResults([]);
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to search this book',
    request: () => searchBook({ bookId: payload.bookId!, query: trimmed, limit: 25 }),
    onSuccess: actions.setResults,
    onError: (error) => {
      console.error(error);
      actions.setResults([]);
      actions.showError('Unable to search this book');
    }
  });
});

export function useBookSearch() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const {
    query: searchQuery,
    results: searchResults,
    loading: searchLoading
  } = useAppSelector(selectSearchWorkflow);

  const setSearchQuery = useCallback(
    (query: string) => {
      dispatch(appActions.setSearchQuery(query));
    },
    [dispatch]
  );

  useEffect(() => {
    dispatch(appActions.resetSearch());
  }, [bookId, dispatch]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!bookId) {
        showToast('Select a book before searching', 'error');
        return;
      }
      const actions: SearchActions = {
        setQuery: (nextQuery) => dispatch(appActions.setSearchQuery(nextQuery)),
        setResults: (results) => dispatch(appActions.setSearchResults(results)),
        setLoading: (loading) => dispatch(appActions.setSearchLoading(loading)),
        setError: () => undefined,
        showError: (message) => showToast(message, 'error')
      };
      await searchHandlers.runAction('runSearch', undefined, actions, { bookId, query });
    },
    [bookId, dispatch, showToast]
  );

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    runSearch
  };
}
