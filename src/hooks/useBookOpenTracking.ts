import { useEffect } from 'react';
import {
  markBookOpened,
  saveLastBook
} from '@/lib/storage';
import {
  selectNavigationState,
  selectReaderSession,
  useAppSelector
} from '@/state/appState';

export function useBookOpenTracking() {
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId } = useAppSelector(selectReaderSession);

  useEffect(() => {
    if (mainView !== 'reader' || !bookId) {
      return;
    }
    saveLastBook(bookId);
    markBookOpened(bookId);
  }, [bookId, mainView]);
}
