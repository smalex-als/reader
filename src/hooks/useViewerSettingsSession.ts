import { useEffect } from 'react';
import { createDefaultSettings } from '@/lib/appConstants';
import {
  loadSettingsForBook,
  saveSettingsForBook
} from '@/lib/storage';
import {
  appActions,
  selectBookLibraryStateReady,
  selectReaderSession,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useViewerSettingsSession() {
  const dispatch = useAppDispatch();
  const libraryStateReady = useAppSelector(selectBookLibraryStateReady);
  const { bookId } = useAppSelector(selectReaderSession);
  const { settings } = useAppSelector(selectViewerWorkflow);

  useEffect(() => {
    if (!libraryStateReady || !bookId) {
      return;
    }
    const baseSettings = createDefaultSettings();
    const storedSettings = loadSettingsForBook(bookId);
    const nextSettings = storedSettings
      ? {
          ...baseSettings,
          ...storedSettings,
          pan: { ...baseSettings.pan, ...storedSettings.pan }
        }
      : baseSettings;
    dispatch(appActions.setViewerSettings(nextSettings));
  }, [bookId, dispatch, libraryStateReady]);

  useEffect(() => {
    if (!bookId) {
      return;
    }
    const timeout = window.setTimeout(() => {
      saveSettingsForBook(bookId, settings);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [bookId, settings]);
}
