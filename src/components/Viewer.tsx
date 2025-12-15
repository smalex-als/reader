import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AppSettings, ViewerMetrics, ViewerPan } from '@/types/app';

interface ViewerProps {
  imageUrl: string | null;
  settings: AppSettings;
  onPan: (pan: ViewerPan) => void;
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

export default function Viewer({ imageUrl, settings, onPan, onMetricsChange, rotation }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointerState = useRef<{ active: boolean; startX: number; startY: number; pan: ViewerPan }>({
    active: false,
    startX: 0,
    startY: 0,
    pan: { x: 0, y: 0 }
  });
  const preloadTokenRef = useRef(0);
  const [activeImage, setActiveImage] = useState<string | null>(imageUrl);
  const [incomingImage, setIncomingImage] = useState<string | null>(null);
  const [showIncoming, setShowIncoming] = useState(false);
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
      naturalWidth: image.naturalWidth || rect.width,
      naturalHeight: image.naturalHeight || rect.height,
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
      const factor = event.ctrlKey || event.metaKey ? 0.1 : 1;
      const nextPan = {
        x: settings.pan.x - event.deltaX * factor,
        y: settings.pan.y - event.deltaY * factor
      };
      onPan(nextPan);
    },
    [onPan, settings.pan.x, settings.pan.y]
  );

  useEffect(() => {
    if (!imageUrl) {
      setActiveImage(null);
      setIncomingImage(null);
      setShowIncoming(false);
      return;
    }
    if (imageUrl === activeImage || imageUrl === incomingImage) {
      return;
    }

    const token = preloadTokenRef.current + 1;
    preloadTokenRef.current = token;

    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    img.onload = () => {
      if (preloadTokenRef.current === token) {
        setIncomingImage(imageUrl);
        setShowIncoming(true);
      }
    };
    img.onerror = () => {
      if (preloadTokenRef.current === token) {
        setIncomingImage(imageUrl);
        setShowIncoming(true);
      }
    };
    img.src = imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [activeImage, imageUrl, incomingImage]);

  useEffect(() => {
    const visibleImage = showIncoming && incomingImage ? incomingImage : activeImage;
    if (!visibleImage) {
      setMetrics({ ...INITIAL_METRICS, scale: settings.zoom });
      onMetricsChange({ ...INITIAL_METRICS, scale: settings.zoom });
      return;
    }
    updateMetrics();
  }, [activeImage, incomingImage, onMetricsChange, showIncoming, settings.zoom, updateMetrics, rotation]);

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
  }, [updateMetrics]);

  const handleImageError = useCallback(() => {
    setMetrics(INITIAL_METRICS);
    onMetricsChange({ ...INITIAL_METRICS, scale: settings.zoom });
  }, [onMetricsChange, settings.zoom]);

  const handleIncomingTransitionEnd = useCallback(() => {
    if (!incomingImage || !showIncoming) {
      return;
    }
    setActiveImage(incomingImage);
    setIncomingImage(null);
    setShowIncoming(false);
  }, [incomingImage, showIncoming]);

  return (
    <div
      ref={containerRef}
      className="viewer"
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      role="presentation"
    >
      {activeImage ? (
        <div className="viewer-stack">
          <img
            ref={imageRef}
            src={activeImage}
            alt=""
            className="viewer-image"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            style={{
              transform,
              filter: filters,
              opacity: showIncoming ? 0 : 1,
              transition: pointerState.current.active
                ? 'none'
                : 'opacity 0.12s ease-out, transform 0.12s ease-out'
            }}
            onError={handleImageError}
            draggable={false}
          />
          {incomingImage && (
            <img
              src={incomingImage}
              alt=""
              className="viewer-image viewer-image-next"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              style={{
                transform,
                filter: filters,
                opacity: showIncoming ? 1 : 0,
                transition: pointerState.current.active
                  ? 'none'
                  : 'opacity 0.12s ease-out, transform 0.12s ease-out'
              }}
              onTransitionEnd={handleIncomingTransitionEnd}
              draggable={false}
            />
          )}
        </div>
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
