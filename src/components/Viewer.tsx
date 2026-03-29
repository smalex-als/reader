import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ZOOM_STEP } from '@/lib/hotkeys';
import type { AppSettings, PageText, ViewerMetrics, ViewerPan } from '@/types/app';

interface ViewerProps {
  imageUrl: string | null;
  pageText: PageText | null;
  editMode: boolean;
  settings: AppSettings;
  onPan: (pan: ViewerPan) => void;
  onZoom: (zoom: number, mode?: AppSettings['zoomMode'], pan?: ViewerPan) => void;
  onMetricsChange: (metrics: ViewerMetrics) => void;
  onPlayTextBlock: (payload: { startIndex: number; blockId: string }) => void;
  onToggleSpeechBlock: (blockId: string) => void;
  rotation: number;
}

const INITIAL_METRICS: ViewerMetrics = {
  containerWidth: 0,
  containerHeight: 0,
  naturalWidth: 0,
  naturalHeight: 0,
  scale: 1
};

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const OCR_COORDINATE_SPACE = 1000;
const NON_INTERACTIVE_BLOCK_KINDS = new Set(['image', 'table']);

export default function Viewer({
  imageUrl,
  pageText,
  editMode,
  settings,
  onPan,
  onZoom,
  onMetricsChange,
  onPlayTextBlock,
  onToggleSpeechBlock,
  rotation
}: ViewerProps) {
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
  const interactiveBlocks = useMemo(() => {
    const blocks = (pageText?.blocks ?? []).filter(
      (block) => !NON_INTERACTIVE_BLOCK_KINDS.has(block.kind.toLowerCase())
    );
    if (editMode) {
      return blocks.filter((block) => block.text.trim().length > 0);
    }
    return blocks.filter((block) => block.streamStartIndex !== null);
  }, [editMode, pageText]);
  const blockCoordinateSpace = useMemo(() => {
    if (interactiveBlocks.length === 0) {
      return null;
    }
    return { width: OCR_COORDINATE_SPACE, height: OCR_COORDINATE_SPACE };
  }, [interactiveBlocks]);

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
          const rawZoom = settings.zoom - direction * ZOOM_STEP;
          const nextZoom = Math.min(Math.max(rawZoom, ZOOM_MIN), ZOOM_MAX);
          const container = containerRef.current;
          if (!container || settings.zoom === nextZoom) {
            onZoom(nextZoom);
            return;
          }
          const rect = container.getBoundingClientRect();
          const cursorX = event.clientX - rect.left - rect.width / 2;
          const cursorY = event.clientY - rect.top - rect.height / 2;
          const zoomRatio = nextZoom / settings.zoom;
          const nextPan = {
            x: settings.pan.x + (1 - zoomRatio) * cursorX,
            y: settings.pan.y + (1 - zoomRatio) * cursorY
          };
          onZoom(nextZoom, 'custom', nextPan);
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
            <div
                className="viewer-stage"
                style={{
                  transform,
                  transition: pointerState.current.active ? 'none' : 'transform 0.12s ease-out'
                }}
            >
              <img
                  ref={imageRef}
                  src={imageUrl}
                  alt=""
                  className="viewer-image"
                  style={{ filter: filters }}
                  onError={handleImageError}
                  draggable={false}
              />
              {metrics.naturalWidth > 0 &&
              metrics.naturalHeight > 0 &&
              interactiveBlocks.length > 0 &&
              blockCoordinateSpace ? (
                  <div
                      className="viewer-image-map"
                      style={{ width: `${metrics.naturalWidth}px`, height: `${metrics.naturalHeight}px` }}
                  >
                    {interactiveBlocks.map((block) => {
                      const [left, top, right, bottom] = block.bounds;
                      const width = Math.max(1, right - left);
                      const height = Math.max(1, bottom - top);
                      return (
                        <button
                            key={block.id}
                            type="button"
                            className="viewer-hotspot"
                            style={{
                              left: `${(left / blockCoordinateSpace.width) * 100}%`,
                              top: `${(top / blockCoordinateSpace.height) * 100}%`,
                              width: `${(width / blockCoordinateSpace.width) * 100}%`,
                              height: `${(height / blockCoordinateSpace.height) * 100}%`
                            }}
                            aria-label={
                              editMode
                                ? `${block.excludedFromSpeech ? 'Restore' : 'Exclude'} ${block.kind} block`
                                : `Play stream from ${block.kind}`
                            }
                            title={
                              editMode
                                ? block.excludedFromSpeech
                                  ? 'Restore block to speech'
                                  : 'Exclude block from speech'
                                : 'Play stream from here'
                            }
                            data-excluded={block.excludedFromSpeech ? 'true' : 'false'}
                            data-edit-mode={editMode ? 'true' : 'false'}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (editMode) {
                                onToggleSpeechBlock(block.id);
                                return;
                              }
                              if (block.streamStartIndex !== null) {
                                onPlayTextBlock({ startIndex: block.streamStartIndex, blockId: block.id });
                              }
                            }}
                        />
                      );
                    })}
                  </div>
              ) : null}
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
