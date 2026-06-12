import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { clamp, clampPan } from '@/lib/math';
import {
  appActions,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AppSettings, ViewerMetrics, ViewerPan, ZoomMode } from '@/types/app';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

type UseZoomOptions = {
  pendingAlignTopRef?: MutableRefObject<boolean>;
  viewMode?: 'pages' | 'scroll' | 'text' | 'audio';
  currentImage?: string | null;
};

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useViewerTransformControls() {
  const dispatch = useAppDispatch();
  const { settings, metrics } = useAppSelector(selectViewerWorkflow);

  const setSettings: Dispatch<SetStateAction<AppSettings>> = useCallback(
    (next) => {
      const nextSettings = resolveNext(next, settings);
      if (nextSettings === settings) {
        return;
      }
      dispatch(appActions.setViewerSettings(nextSettings));
    },
    [dispatch, settings]
  );

  const updateTransform = useCallback(
    (partial: Partial<Pick<AppSettings, 'zoom' | 'zoomMode' | 'rotation' | 'pan'>>) => {
      setSettings((prev) => {
        const requestedZoom = partial.zoom ?? prev.zoom;
        const clampedZoom = clamp(requestedZoom, ZOOM_MIN, ZOOM_MAX);
        const nextZoomMode = partial.zoomMode ?? prev.zoomMode;
        const basePan = partial.pan ?? prev.pan;
        const panMetrics = metrics ? { ...metrics, scale: clampedZoom } : null;
        const nextPan = panMetrics ? clampPan(basePan, panMetrics) : basePan;
        const rotation = partial.rotation ?? prev.rotation;

        if (
          clampedZoom === prev.zoom &&
          nextZoomMode === prev.zoomMode &&
          rotation === prev.rotation &&
          nextPan.x === prev.pan.x &&
          nextPan.y === prev.pan.y
        ) {
          return prev;
        }

        return {
          ...prev,
          ...partial,
          zoom: clampedZoom,
          zoomMode: nextZoomMode,
          rotation,
          pan: nextPan
        };
      });
    },
    [metrics, setSettings]
  );

  const applyZoomMode = useCallback(
    (mode: ZoomMode, overrideMetrics?: ViewerMetrics | null) => {
      const targetMetrics = overrideMetrics ?? metrics;
      if (!targetMetrics || targetMetrics.naturalWidth === 0 || targetMetrics.naturalHeight === 0) {
        updateTransform({ zoomMode: mode, pan: { x: 0, y: 0 } });
        return;
      }

      const rotation = Math.abs(settings.rotation % 360);
      const rotated = rotation === 90 || rotation === 270;
      const naturalWidth = rotated ? targetMetrics.naturalHeight : targetMetrics.naturalWidth;
      const naturalHeight = rotated ? targetMetrics.naturalWidth : targetMetrics.naturalHeight;

      let nextZoom = settings.zoom;
      if (mode === 'fit-width' && naturalWidth > 0) {
        nextZoom = targetMetrics.containerWidth / naturalWidth;
      } else if (mode === 'fit-height' && naturalHeight > 0) {
        nextZoom = targetMetrics.containerHeight / naturalHeight;
      }

      if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
        nextZoom = 1;
      }

      updateTransform({ zoom: nextZoom, zoomMode: mode, pan: settings.pan });
    },
    [metrics, settings.pan, settings.rotation, settings.zoom, updateTransform]
  );

  const updateZoom = useCallback(
    (nextZoom: number, mode: ZoomMode = 'custom', pan?: ViewerPan) => {
      updateTransform({ zoom: nextZoom, zoomMode: mode, pan });
    },
    [updateTransform]
  );

  const updateRotation = useCallback(() => {
    const nextRotation = (settings.rotation + 90) % 360;
    updateTransform({ rotation: nextRotation, pan: { x: 0, y: 0 } });
  }, [settings.rotation, updateTransform]);

  const updatePan = useCallback(
    (nextPan: ViewerPan) => {
      updateTransform({ pan: nextPan });
    },
    [updateTransform]
  );

  const resetTransform = useCallback(() => {
    updateTransform({ zoom: 1, zoomMode: 'custom', rotation: 0, pan: { x: 0, y: 0 } });
  }, [updateTransform]);

  const applyFilters = useCallback(
    (
      filters: Partial<
        Pick<AppSettings, 'brightness' | 'contrast' | 'invert' | 'dimOutsideBlocks' | 'dimOutsideBlocksIntensity'>
      >
    ) => {
      setSettings((prev) => ({
        ...prev,
        ...filters
      }));
    },
    [setSettings]
  );

  return {
    settings,
    setSettings,
    metrics,
    applyZoomMode,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform,
    applyFilters
  };
}

export function useZoom({
  pendingAlignTopRef,
  viewMode,
  currentImage = null
}: UseZoomOptions = {}) {
  const lastImageRef = useRef<string | null>(null);
  const {
    settings,
    setSettings,
    metrics,
    applyZoomMode,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform,
    applyFilters
  } = useViewerTransformControls();

  const applyZoomModeWithAlign = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      applyZoomMode(mode);
      if (viewMode === 'pages' && pendingAlignTopRef) {
        pendingAlignTopRef.current = true;
      }
    },
    [applyZoomMode, pendingAlignTopRef, viewMode]
  );

  const fitWidth = useCallback(() => {
    applyZoomModeWithAlign('fit-width');
  }, [applyZoomModeWithAlign]);

  const fitHeight = useCallback(() => {
    applyZoomModeWithAlign('fit-height');
  }, [applyZoomModeWithAlign]);

  useEffect(() => {
    if (!pendingAlignTopRef) {
      return;
    }
    if (viewMode !== 'pages') {
      lastImageRef.current = currentImage;
      return;
    }
    if (currentImage && lastImageRef.current !== currentImage) {
      pendingAlignTopRef.current = true;
    }
    lastImageRef.current = currentImage;
  }, [currentImage, pendingAlignTopRef, viewMode]);

  useEffect(() => {
    if (
      !pendingAlignTopRef?.current ||
      !metrics ||
      viewMode !== 'pages' ||
      metrics.naturalHeight === 0 ||
      metrics.scale !== settings.zoom
    ) {
      return;
    }
    const scaledHeight = metrics.naturalHeight * metrics.scale;
    const limitY = Math.max(0, (scaledHeight - metrics.containerHeight) / 2);
    const targetPan = clampPan({ x: 0, y: limitY }, metrics);
    if (settings.pan.x !== targetPan.x || settings.pan.y !== targetPan.y) {
      setSettings((prev) => {
        if (prev.pan.x === targetPan.x && prev.pan.y === targetPan.y) {
          return prev;
        }
        return { ...prev, pan: targetPan };
      });
      return;
    }
    pendingAlignTopRef.current = false;
  }, [
    metrics,
    pendingAlignTopRef,
    setSettings,
    settings.pan.x,
    settings.pan.y,
    settings.zoom,
    viewMode
  ]);

  useEffect(() => {
    if (!metrics) {
      return;
    }
    if (settings.zoomMode === 'custom') {
      return;
    }
    applyZoomMode(settings.zoomMode, metrics);
  }, [applyZoomMode, metrics, settings.zoomMode]);

  return {
    settings,
    setSettings,
    metrics,
    applyZoomMode,
    fitWidth,
    fitHeight,
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform,
    applyFilters
  };
}
