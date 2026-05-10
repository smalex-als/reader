import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import type { BookSearchResponse, SearchResult } from '@/types/app';

interface UseBookSearchOptions {
  bookId: string | null;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useBookSearch(options: UseBookSearchOptions) {
  const { bookId, showToast } = options;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, [bookId]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!bookId) {
        showToast('Select a book before searching', 'error');
        return;
      }
      const trimmed = query.trim();
      setSearchQuery(query);
      if (!trimmed) {
        setSearchResults([]);
        return;
      }
      setSearchLoading(true);
      try {
        const result = await fetchJson<BookSearchResponse>(
          `/api/books/${encodeURIComponent(bookId)}/search?q=${encodeURIComponent(trimmed)}&limit=25`
        );
        setSearchResults(Array.isArray(result.results) ? result.results : []);
      } catch (error) {
        console.error(error);
        showToast('Unable to search this book', 'error');
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [bookId, showToast]
  );

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    runSearch
  };
}
