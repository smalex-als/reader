import { useEffect } from 'react';
import { useBookmarks } from '@/hooks/useBookmarks';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';

type UseReaderLifecycleEffectsOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  resetAudioCache: () => void;
  stopAudio: () => void;
  stopStream: () => void;
};

export function useReaderLifecycleEffects({
  bookId,
  chapterNumber,
  resetAudioCache,
  stopAudio,
  stopStream
}: UseReaderLifecycleEffectsOptions) {
  const dispatch = useAppDispatch();
  const { closeBookmarks } = useBookmarks();

  useEffect(() => {
    dispatch(appActions.setDisplayedChapterText(null));
  }, [bookId, chapterNumber, dispatch]);

  useEffect(() => {
    closeBookmarks();
    dispatch(appActions.closeModal('search'));
    dispatch(appActions.closeModal('text'));
    dispatch(appActions.closeBookCard());
    dispatch(appActions.resetPageText());
    resetAudioCache();
    stopAudio();
    stopStream();
  }, [bookId, closeBookmarks, dispatch, resetAudioCache, stopAudio, stopStream]);
}
