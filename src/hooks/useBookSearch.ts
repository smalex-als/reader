import { useCallback, useEffect } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { useToast } from '@/hooks/useToast';
import {
  appActions,
  selectReaderSession,
  selectSearchWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { BookSearchResponse } from '@/types/app';

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
      const trimmed = query.trim();
      dispatch(appActions.setSearchQuery(query));
      if (!trimmed) {
        dispatch(appActions.setSearchResults([]));
        return;
      }
      dispatch(appActions.setSearchLoading(true));
      try {
        const result = await fetchJson<BookSearchResponse>(
          `/api/books/${encodeURIComponent(bookId)}/search?q=${encodeURIComponent(trimmed)}&limit=25`
        );
        dispatch(appActions.setSearchResults(Array.isArray(result.results) ? result.results : []));
      } catch (error) {
        console.error(error);
        showToast('Unable to search this book', 'error');
        dispatch(appActions.setSearchResults([]));
      } finally {
        dispatch(appActions.setSearchLoading(false));
      }
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
