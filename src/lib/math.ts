import type { ViewerMetrics, ViewerPan } from '@/types/app';

export function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

export function clampPan(pan: ViewerPan, metrics: ViewerMetrics | null) {
  if (!metrics) {
    return { x: 0, y: 0 };
  }
  const { containerWidth, containerHeight, naturalWidth, naturalHeight, scale } = metrics;

  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;
  const limitX = Math.max(0, (scaledWidth - containerWidth) / 2);
  const limitY = Math.max(0, (scaledHeight - containerHeight) / 2);

  if (limitX === 0 && limitY === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp(pan.x, -limitX, limitX),
    y: clamp(pan.y, -limitY, limitY)
  };
}
