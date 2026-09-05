import { useCallback, useEffect } from 'react';
import { searchBook } from '@/api/bookSearch';
import { useToast } from '@/hooks/useToast';
import {
  appActions,
  selectReaderSession,
  selectSearchWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

let nextSearchRequestId = 0;

export function useBookSearch() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const search = useAppSelector(selectSearchWorkflow);

  const setSearchQuery = useCallback(
    (query: string) => {
      dispatch(appActions.setSearchQuery(query));
    },
    [dispatch]
  );

  useEffect(() => {
    dispatch(appActions.resetSearch());
    return () => { dispatch(appActions.resetSearch()); };
  }, [bookId, dispatch]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!bookId) {
        showToast('Select a book before searching', 'error');
        return;
      }
      if (!query.trim()) {
        dispatch(appActions.resetSearch());
        return;
      }

      const requestId = ++nextSearchRequestId;
      dispatch(appActions.startSearch(query, requestId));
      try {
        const results = await searchBook({ bookId, query: query.trim(), limit: 25 });
        dispatch(appActions.completeSearch(results, requestId));
      } catch {
        dispatch(appActions.failSearch(requestId));
      }
    },
    [bookId, dispatch, showToast]
  );

  return {
    searchQuery: search.query,
    setSearchQuery,
    searchResults: search.results,
    searchLoading: search.status === 'loading',
    searchStatus: search.status,
    submittedQuery: search.submittedQuery,
    runSearch
  };
}
