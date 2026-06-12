import { useEffect, useRef } from 'react';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useNavigation } from '@/hooks/useNavigation';
import { useZoom } from '@/hooks/useZoom';
import type { ViewMode } from '@/lib/appConstants';
import {
  appActions,
  selectShellControlRequest,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type UseReaderShellControlsOptions = {
  viewMode: ViewMode;
  currentImage: string | null;
};

export function useReaderShellControls({
  viewMode,
  currentImage
}: UseReaderShellControlsOptions) {
  const dispatch = useAppDispatch();
  const pendingAlignTopRef = useRef(false);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);
  const shellControlRequest = useAppSelector(selectShellControlRequest);

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
    gotoInputRef,
    isFullscreen,
    modalHostRef,
    viewerShellRef
  };
}
