import { forwardRef, useEffect, useMemo, useRef, type HTMLAttributes } from 'react';
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso';
import OcrOverlay from '@/components/OcrOverlay';
import type { PageText } from '@/types/app';
import type { AppSettings } from '@/types/app';

interface ScrollViewerProps {
  manifest: string[];
  currentPage: number;
  settings: Pick<AppSettings, 'invert' | 'brightness' | 'contrast'>;
  textCache: Record<string, PageText>;
  pageText: PageText | null;
  editMode: boolean;
  dimOutsideBlocks: boolean;
  dimOutsideBlocksIntensity: number;
  fetchPageTextByImage: (
    image: string,
    options?: { force?: boolean; silent?: boolean; updateCurrentState?: boolean }
  ) => Promise<PageText | null>;
  onPlayTextBlock: (payload: { startIndex: number; blockId: string }) => void;
  onToggleSpeechBlock: (blockId: string) => void;
  onCurrentPageChange: (pageIndex: number) => void;
}

const ScrollScroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ScrollScroller(props, ref) {
    return <div {...props} ref={ref} />;
  }
);

export default function ScrollViewer({
  manifest,
  currentPage,
  settings,
  textCache,
  pageText,
  editMode,
  dimOutsideBlocks,
  dimOutsideBlocksIntensity,
  fetchPageTextByImage,
  onPlayTextBlock,
  onToggleSpeechBlock,
  onCurrentPageChange
}: ScrollViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const internalPageRef = useRef(currentPage);
  const hasMountedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const virtuosoComponents = useMemo(
    () => ({
      Scroller: forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
        function ScrollViewerScroller(props, ref) {
          return (
            <ScrollScroller
              {...props}
              ref={(node) => {
                scrollerRef.current = node;
                if (typeof ref === 'function') {
                  ref(node);
                } else if (ref) {
                  ref.current = node;
                }
              }}
            />
          );
        }
      )
    }),
    []
  );

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

  const updateCurrentPageFromViewport = () => {
    const scroller = scrollerRef.current;
    if (!hasMountedRef.current || manifest.length === 0 || !scroller) {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const viewportMidpoint = scrollerRect.top + scrollerRect.height / 2;
    const renderedPages = Array.from(
      scroller.querySelectorAll<HTMLElement>('.scroll-viewer-page[data-page-index]')
    );
    if (renderedPages.length === 0) {
      return;
    }
    let nextPage = currentPage;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const page of renderedPages) {
      const rect = page.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(midpoint - viewportMidpoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextPage = Number.parseInt(page.dataset.pageIndex || String(currentPage), 10);
      }
    }
    internalPageRef.current = nextPage;
    if (nextPage !== currentPage) {
      onCurrentPageChange(nextPage);
    }
  };

  const prefetchVisibleRange = (range: ListRange) => {
    const start = Math.max(0, range.startIndex - 1);
    const end = Math.min(manifest.length - 1, range.endIndex + 1);
    for (let index = start; index <= end; index += 1) {
      const image = manifest[index];
      if (!image || textCache[image]) {
        continue;
      }
      void fetchPageTextByImage(image, { silent: true, updateCurrentState: false });
    }
  };

  const handleRangeChanged = (range: ListRange) => {
    prefetchVisibleRange(range);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateCurrentPageFromViewport();
    });
  };

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const handleScroll = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = null;
        updateCurrentPageFromViewport();
      });
    };
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [updateCurrentPageFromViewport]);

  if (manifest.length === 0) {
    return <div className="viewer-empty">No pages available.</div>;
  }

  return (
    <div className="scroll-viewer">
      <Virtuoso
        ref={virtuosoRef}
        className="scroll-viewer-virtuoso"
        components={virtuosoComponents}
        totalCount={manifest.length}
        initialTopMostItemIndex={currentPage}
        increaseViewportBy={{ top: 1200, bottom: 1200 }}
        overscan={600}
        rangeChanged={handleRangeChanged}
        itemContent={(index) => {
          const imageUrl = manifest[index];
          const entry = index === currentPage ? pageText : textCache[imageUrl] ?? null;
          return (
            <div
              className={`scroll-viewer-page ${index === currentPage ? 'scroll-viewer-page-active' : ''}`}
              data-page-index={index}
            >
              <div className="scroll-viewer-image-frame">
                <img
                  src={imageUrl}
                  alt={`Page ${index + 1}`}
                  className="scroll-viewer-image"
                  style={{ filter: filters }}
                  loading="lazy"
                />
                {index === currentPage ? (
                  <OcrOverlay
                    pageText={entry}
                    editMode={editMode}
                    dimOutsideBlocks={dimOutsideBlocks}
                    dimOutsideBlocksIntensity={dimOutsideBlocksIntensity}
                    onPlayTextBlock={onPlayTextBlock}
                    onToggleSpeechBlock={onToggleSpeechBlock}
                  />
                ) : entry ? (
                  <OcrOverlay
                    pageText={entry}
                    editMode={false}
                    dimOutsideBlocks={dimOutsideBlocks}
                    dimOutsideBlocksIntensity={dimOutsideBlocksIntensity}
                    onPlayTextBlock={onPlayTextBlock}
                    onToggleSpeechBlock={onToggleSpeechBlock}
                  />
                ) : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
