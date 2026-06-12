import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  bookSessionHandlers,
  createBookSessionActions,
  type BookSessionActions
} from '@/hooks/bookSessionActions';
import { getBookFromLocation } from '@/lib/bookUrl';
import {
  loadLibraryStateFromServer,
  saveLastBook
} from '@/lib/storage';
import { useToast } from '@/hooks/useToast';
import {
  appActions,
  selectBookIds,
  selectBookLibraryStateReady,
  selectModalOpen,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useBookLibrarySession() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { mainView } = useAppSelector(selectNavigationState);
  const { bookId } = useAppSelector(selectReaderSession);
  const bookModalOpen = useAppSelector(selectModalOpen('bookSelect'));
  const books = useAppSelector(selectBookIds);
  const libraryStateReady = useAppSelector(selectBookLibraryStateReady);
  const lastBookRef = useRef<string | null>(null);

  const setBooks: Dispatch<SetStateAction<string[]>> = useCallback(
    (next) => {
      dispatch(appActions.setBookSessionBooks(resolveNext(next, books)));
    },
    [books, dispatch]
  );

  const setBookId = useCallback(
    (nextBookId: string | null) => {
      dispatch(appActions.setReaderBookId(nextBookId));
    },
    [dispatch]
  );

  const setBookModalOpen = useCallback(
    (open: boolean) => {
      dispatch(appActions.setModalOpen('bookSelect', open));
    },
    [dispatch]
  );

  const libraryActions = useMemo<BookSessionActions>(
    () =>
      createBookSessionActions({
        applyLoadedBooks: (loadedBooks, currentBookId) => {
          setBooks(loadedBooks);
          if (mainView !== 'reader') {
            return;
          }
          if (loadedBooks.length === 0) {
            setBookId(null);
            showToast('No books found. Add files to /data to begin.', 'info');
            return;
          }
          if (currentBookId && loadedBooks.includes(currentBookId)) {
            return;
          }
          if (!currentBookId) {
            setBookModalOpen(true);
            return;
          }
          const fallback = loadedBooks[0];
          setBookId(fallback);
          saveLastBook(fallback);
        },
        showError: (message) => showToast(message, 'error')
      }),
    [mainView, setBookId, setBookModalOpen, setBooks, showToast]
  );
  const libraryActionsRef = useRef(libraryActions);

  useEffect(() => {
    libraryActionsRef.current = libraryActions;
  }, [libraryActions]);

  useEffect(() => {
    let cancelled = false;
    void loadLibraryStateFromServer()
      .then((state) => {
        if (cancelled) {
          return;
        }
        lastBookRef.current = state.lastBook ?? null;
        if (mainView === 'reader' && !getBookFromLocation() && state.lastBook) {
          setBookId(state.lastBook);
        }
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setBookSessionLibraryStateReady(true));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, setBookId]);

  useEffect(() => {
    if (mainView !== 'reader' || bookId || getBookFromLocation()) {
      return;
    }
    if (lastBookRef.current) {
      setBookId(lastBookRef.current);
    }
  }, [bookId, mainView, setBookId]);

  useEffect(() => {
    if (!libraryStateReady) {
      return;
    }
    if (mainView !== 'reader' && !bookModalOpen) {
      return;
    }
    void bookSessionHandlers.runAction('loadBooks', null, libraryActionsRef.current, {
      currentBookId: bookId
    });
  }, [bookId, bookModalOpen, libraryStateReady, mainView]);
}
