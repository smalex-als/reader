import { useEffect } from 'react';
import {
  markBookOpened,
  saveLastBook
} from '@/lib/storage';
import {
  selectReaderSession,
  useAppSelector
} from '@/state/appState';

export function useBookOpenTracking() {
  const { bookId } = useAppSelector(selectReaderSession);

  useEffect(() => {
    if (!bookId) {
      return;
    }
    saveLastBook(bookId);
    markBookOpened(bookId);
  }, [bookId]);
}
