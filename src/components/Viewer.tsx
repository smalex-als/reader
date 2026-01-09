import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ZOOM_STEP } from '@/lib/hotkeys';
import type { AppSettings, ViewerMetrics, ViewerPan } from '@/types/app';

interface ViewerProps {
  imageUrl: string | null;
  settings: AppSettings;
  onPan: (pan: ViewerPan) => void;
  onZoom: (zoom: number) => void;
  onMetricsChange: (metrics: ViewerMetrics) => void;
  rotation: number;
}

const INITIAL_METRICS: ViewerMetrics = {
  containerWidth: 0,
  containerHeight: 0,
  naturalWidth: 0,
  naturalHeight: 0,
  scale: 1
};

export default function Viewer({ imageUrl, settings, onPan, onZoom, onMetricsChange, rotation }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointerState = useRef<{ active: boolean; startX: number; startY: number; pan: ViewerPan }>({
    active: false,
    startX: 0,
    startY: 0,
    pan: { x: 0, y: 0 }
  });
  const [metrics, setMetrics] = useState<ViewerMetrics>(INITIAL_METRICS);

  const filters = useMemo(() => {
    const invertFilter = settings.invert ? 'invert(1)' : 'invert(0)';
    const brightnessFilter = `brightness(${settings.brightness}%)`;
    const contrastFilter = `contrast(${settings.contrast}%)`;
    return `${invertFilter} ${brightnessFilter} ${contrastFilter}`;
  }, [settings.brightness, settings.contrast, settings.invert]);

  const transform = useMemo(() => {
    return `translate(${settings.pan.x}px, ${settings.pan.y}px) scale(${settings.zoom}) rotate(${rotation}deg)`;
  }, [rotation, settings.pan.x, settings.pan.y, settings.zoom]);

  const updateMetrics = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) {
      const emptyMetrics = { ...INITIAL_METRICS, scale: settings.zoom };
      setMetrics(emptyMetrics);
      onMetricsChange(emptyMetrics);
      return;
    }
    const rect = container.getBoundingClientRect();
    const nextMetrics: ViewerMetrics = {
      containerWidth: rect.width,
      containerHeight: rect.height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      scale: settings.zoom
    };
    setMetrics(nextMetrics);
    onMetricsChange(nextMetrics);
  }, [onMetricsChange, settings.zoom]);

  const handlePointerMove = useCallback(
      (event: PointerEvent) => {
        if (!pointerState.current.active) {
          return;
        }
        event.preventDefault();
        const deltaX = event.clientX - pointerState.current.startX;
        const deltaY = event.clientY - pointerState.current.startY;
        const nextPan = {
          x: pointerState.current.pan.x + deltaX,
          y: pointerState.current.pan.y + deltaY
        };
        onPan(nextPan);
      },
      [onPan]
  );

  const handlePointerUp = useCallback(
      (event: PointerEvent) => {
        if (!pointerState.current.active) {
          return;
        }
        pointerState.current.active = false;
        event.preventDefault();
        const element = containerRef.current;
        if (element && element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      },
      [handlePointerMove]
  );

  const handlePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!containerRef.current) {
          return;
        }
        event.preventDefault();
        pointerState.current = {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
          pan: { ...settings.pan }
        };
        containerRef.current.setPointerCapture(event.pointerId);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      },
      [handlePointerMove, handlePointerUp, settings.pan]
  );

  const handleWheel = useCallback(
      (event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          if (event.deltaY === 0) {
            return;
          }
          const direction = Math.sign(event.deltaY);
          const nextZoom = settings.zoom - direction * ZOOM_STEP;
          onZoom(nextZoom);
          return;
        }
        const nextPan = {
          x: settings.pan.x - event.deltaX,
          y: settings.pan.y - event.deltaY
        };
        onPan(nextPan);
      },
      [onPan, onZoom, settings.pan.x, settings.pan.y, settings.zoom]
  );

  useEffect(() => {
    updateMetrics();
  }, [imageUrl, settings.zoom, updateMetrics, rotation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => updateMetrics());
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [updateMetrics]);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }
    const img = imageRef.current;
    if (!img) {
      return;
    }
    if (img.complete && img.naturalWidth > 0) {
      updateMetrics();
      return;
    }
    const handleLoad = () => updateMetrics();
    img.addEventListener('load', handleLoad);
    return () => {
      img.removeEventListener('load', handleLoad);
    };
  }, [imageUrl, updateMetrics]);

  const handleImageError = useCallback(() => {
    setMetrics(INITIAL_METRICS);
    onMetricsChange({ ...INITIAL_METRICS, scale: settings.zoom });
  }, [onMetricsChange, settings.zoom]);

  return (
      <div
          ref={containerRef}
          className="viewer"
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
          role="presentation"
      >
        {imageUrl ? (
            <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                className="viewer-image"
                style={{
                  transform,
                  filter: filters,
                  transition: pointerState.current.active ? 'none' : 'transform 0.12s ease-out'
                }}
                onError={handleImageError}
                draggable={false}
            />
        ) : (
            <div className="viewer-empty">Select a book to begin</div>
        )}
        {metrics.naturalWidth > 0 && (
            <div className="viewer-overlay">
              {Math.round(metrics.naturalWidth)} × {Math.round(metrics.naturalHeight)}
            </div>
        )}
      </div>
  );
}
