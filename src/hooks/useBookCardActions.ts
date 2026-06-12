import { useEffect, useRef } from 'react';
import { fetchBookCard, fetchBookCards, saveBookCard } from '@/api/books';
import {
  appActions,
  selectBookCardWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useBookCardActions() {
  const dispatch = useAppDispatch();
  const {
    cardsRefreshRequestId,
    editor: { loadRequest, saveRequest }
  } = useAppSelector(selectBookCardWorkflow);
  const handledCardsRequestRef = useRef(0);
  const handledLoadRequestRef = useRef(0);
  const handledSaveRequestRef = useRef(0);

  useEffect(() => {
    if (cardsRefreshRequestId === 0 || handledCardsRequestRef.current === cardsRefreshRequestId) {
      return;
    }

    handledCardsRequestRef.current = cardsRefreshRequestId;
    let cancelled = false;

    dispatch(appActions.setBookCardsLoading(true));
    dispatch(appActions.setBookCardsError(null));

    fetchBookCards()
      .then((cardsByBook) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setBookCards(cardsByBook));
        dispatch(appActions.setBookCardsError(null));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setBookCardsError(error instanceof Error ? error.message : String(error)));
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setBookCardsLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cardsRefreshRequestId, dispatch]);

  useEffect(() => {
    if (!loadRequest || handledLoadRequestRef.current === loadRequest.id) {
      return;
    }

    handledLoadRequestRef.current = loadRequest.id;
    let cancelled = false;

    dispatch(appActions.setBookCardEditorLoading(true));
    dispatch(appActions.setBookCardEditorError(null));

    fetchBookCard(loadRequest.bookId)
      .then((card) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setBookCardEditorCard(card));
        dispatch(appActions.setBookCardEditorError(null));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(
          appActions.setBookCardEditorError(
            error instanceof Error ? error.message : 'Unable to load saved book card data'
          )
        );
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setBookCardEditorLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, loadRequest]);

  useEffect(() => {
    if (!saveRequest || handledSaveRequestRef.current === saveRequest.id) {
      return;
    }

    handledSaveRequestRef.current = saveRequest.id;
    let cancelled = false;

    dispatch(appActions.setBookCardEditorSaving(true));
    dispatch(appActions.setBookCardEditorError(null));

    saveBookCard(saveRequest.bookId, saveRequest.card)
      .then((card) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setBookCardEditorCard(card));
        dispatch(appActions.refreshBookCards());
        dispatch(appActions.closeBookCard());
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setBookCardEditorError(error instanceof Error ? error.message : String(error)));
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setBookCardEditorSaving(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, saveRequest]);
}
