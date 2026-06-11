import { useCallback } from 'react';
import {
  appActions,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type BooleanSetter = (next: boolean | ((prev: boolean) => boolean)) => void;

function resolveNext<T>(next: T | ((prev: T) => T), current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useModalState() {
  const dispatch = useAppDispatch();
  const settingsOpen = useAppSelector(selectModalOpen('settings'));

  const closeOcrQueue = useCallback(() => dispatch(appActions.closeModal('ocrQueue')), [dispatch]);
  const closeSearch = useCallback(() => dispatch(appActions.closeModal('search')), [dispatch]);
  const setSettingsOpen: BooleanSetter = useCallback(
    (next) => dispatch(appActions.setModalOpen('settings', resolveNext(next, settingsOpen))),
    [dispatch, settingsOpen]
  );

  const closeBookCard = useCallback(() => dispatch(appActions.closeBookCard()), [dispatch]);

  return {
    closeOcrQueue,
    closeSearch,
    closeBookCard,
    setSettingsOpen
  };
}
