import { useEffect, useMemo, useRef } from 'react';
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso';
import type { AppSettings } from '@/types/app';

interface ScrollViewerProps {
  manifest: string[];
  currentPage: number;
  settings: Pick<AppSettings, 'invert' | 'brightness' | 'contrast'>;
  onCurrentPageChange: (pageIndex: number) => void;
}

export default function ScrollViewer({
  manifest,
  currentPage,
  settings,
  onCurrentPageChange
}: ScrollViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const internalPageRef = useRef(currentPage);
  const hasMountedRef = useRef(false);

  const filters = useMemo(() => {
    const invertFilter = settings.invert ? 'invert(1)' : 'invert(0)';
    const brightnessFilter = `brightness(${settings.brightness}%)`;
    const contrastFilter = `contrast(${settings.contrast}%)`;
    return `${invertFilter} ${brightnessFilter} ${contrastFilter}`;
  }, [settings.brightness, settings.contrast, settings.invert]);

  useEffect(() => {
    if (manifest.length === 0) {
      internalPageRef.current = 0;
      return;
    }
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      internalPageRef.current = currentPage;
      return;
    }
    if (currentPage === internalPageRef.current) {
      return;
    }
    internalPageRef.current = currentPage;
    virtuosoRef.current?.scrollToIndex({
      index: currentPage,
      align: 'start',
      behavior: 'smooth'
    });
  }, [currentPage, manifest.length]);

  const handleRangeChanged = (range: ListRange) => {
    if (!hasMountedRef.current || manifest.length === 0) {
      return;
    }
    const nextPage = Math.max(
      0,
      Math.min(manifest.length - 1, Math.floor((range.startIndex + range.endIndex) / 2))
    );
    internalPageRef.current = nextPage;
    if (nextPage !== currentPage) {
      onCurrentPageChange(nextPage);
    }
  };

  if (manifest.length === 0) {
    return <div className="viewer-empty">No pages available.</div>;
  }

  return (
    <div className="scroll-viewer">
      <Virtuoso
        ref={virtuosoRef}
        className="scroll-viewer-virtuoso"
        totalCount={manifest.length}
        initialTopMostItemIndex={currentPage}
        increaseViewportBy={{ top: 1200, bottom: 1200 }}
        overscan={600}
        rangeChanged={handleRangeChanged}
        itemContent={(index) => {
          const imageUrl = manifest[index];
          return (
            <div
              className={`scroll-viewer-page ${index === currentPage ? 'scroll-viewer-page-active' : ''}`}
              data-page-index={index}
            >
              <div className="scroll-viewer-page-header">Page {index + 1}</div>
              <img
                src={imageUrl}
                alt={`Page ${index + 1}`}
                className="scroll-viewer-image"
                style={{ filter: filters }}
                loading="lazy"
              />
            </div>
          );
        }}
      />
    </div>
  );
}
