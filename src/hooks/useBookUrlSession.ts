import { useEffect } from 'react';
import {
  getBookFromLocation,
  syncBookLocation
} from '@/lib/bookUrl';
import {
  appActions,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useBookUrlSession() {
  const dispatch = useAppDispatch();
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const navigationCount = bookType === 'text' ? chapterCount : manifest.length;

  useEffect(() => {
    if (mainView === 'units') {
      return;
    }
    syncBookLocation({
      bookId,
      currentPage,
      viewMode,
      navigationCount
    });
  }, [bookId, currentPage, mainView, navigationCount, viewMode]);

  useEffect(() => {
    const handleLocationChange = () => {
      dispatch(appActions.setReaderBookId(getBookFromLocation()));
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [dispatch]);
}
