import { useRef } from 'react';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useNavigation } from '@/hooks/useNavigation';
import { useZoom } from '@/hooks/useZoom';
import type { ViewMode } from '@/lib/appConstants';

type UseReaderShellControlsOptions = {
  viewMode: ViewMode;
  currentImage: string | null;
};

export function useReaderShellControls({
  viewMode,
  currentImage
}: UseReaderShellControlsOptions) {
  const pendingAlignTopRef = useRef(false);
  const modalHostRef = useRef<HTMLDivElement | null>(null);
  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const gotoInputRef = useRef<HTMLInputElement | null>(null);

  const { isFullscreen, toggleFullscreen } = useFullscreen(viewerShellRef);
  const { fitWidth, fitHeight } = useZoom({
    pendingAlignTopRef,
    viewMode,
    currentImage
  });
  useNavigation({
    pendingAlignTopRef
  });

  return {
    fitWidth,
    fitHeight,
    gotoInputRef,
    isFullscreen,
    modalHostRef,
    toggleFullscreen,
    viewerShellRef
  };
}
