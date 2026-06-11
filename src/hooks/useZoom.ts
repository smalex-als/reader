import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
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

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useZoom(_initialSettings: AppSettings) {
  const dispatch = useAppDispatch();
  const { settings, metrics } = useAppSelector(selectViewerWorkflow);

  const setSettings: Dispatch<SetStateAction<AppSettings>> = useCallback(
    (next) => {
      dispatch(appActions.setViewerSettings(resolveNext(next, settings)));
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
    updateZoom,
    updateRotation,
    updatePan,
    resetTransform
  };
}
