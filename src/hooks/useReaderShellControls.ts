import { useEffect, useRef } from 'react';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useNavigation } from '@/hooks/useNavigation';
import { useZoom } from '@/hooks/useZoom';
import {
  appActions,
  selectBookManifest,
  selectReaderSession,
  selectShellControlRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useReaderShellControls() {
  const dispatch = useAppDispatch();
  const pendingAlignTopRef = useRef(false);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const { currentPage, viewMode } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const shellControlRequest = useAppSelector(selectShellControlRequest);
  const currentImage = manifest[currentPage] ?? null;

  const { isFullscreen, toggleFullscreen } = useFullscreen(viewerShellRef);
  const { fitWidth, fitHeight } = useZoom({
    pendingAlignTopRef,
    viewMode,
    currentImage
  });
  useNavigation({
    pendingAlignTopRef
  });

  useEffect(() => {
    if (!shellControlRequest) {
      return;
    }
    if (shellControlRequest.kind === 'fitWidth') {
      fitWidth();
    } else if (shellControlRequest.kind === 'fitHeight') {
      fitHeight();
    } else {
      void toggleFullscreen();
    }
    dispatch(appActions.clearShellControlRequest());
  }, [dispatch, fitHeight, fitWidth, shellControlRequest, toggleFullscreen]);

  return {
    isFullscreen,
    modalHostRef,
    viewerShellRef
  };
}

export type ReaderShellControls = ReturnType<typeof useReaderShellControls>;
