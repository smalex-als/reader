import { forwardRef, useCallback, useEffect, useMemo, useRef, type HTMLAttributes } from 'react';
import { Virtuoso, type ListRange, type VirtuosoHandle } from 'react-virtuoso';
import OcrOverlay from '@/components/OcrOverlay';
import { usePageText } from '@/hooks/usePageText';
import { saveLastPage } from '@/lib/storage';
import { parseStreamLocator } from '@/lib/streamLocator';
import {
  appActions,
  selectBookManifest,
  selectPageTextWorkflow,
  selectReaderSession,
  selectStreamRuntime,
  selectStreamUiControls,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

const PAGE_VISIBILITY_THRESHOLD = 0.35;
const BLOCK_VISIBILITY_THRESHOLD = 0.55;
const PAGE_TOP_MARGIN = 80;
const BLOCK_READING_ZONE_TOP = 48;
const BLOCK_READING_ZONE_HEIGHT_RATIO = 0.66;
const BLOCK_SCROLL_TARGET_OFFSET = 88;
const VIEWPORT_PREFETCH_PADDING = 1;
const STREAM_TEXT_PREFETCH_AHEAD = 3;

const ScrollScroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ScrollScroller(props, ref) {
    return <div {...props} ref={ref} />;
  }
);

function getVisibleRatio(containerRect: DOMRect, itemRect: DOMRect) {
  const visibleTop = Math.max(containerRect.top, itemRect.top);
  const visibleBottom = Math.min(containerRect.bottom, itemRect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  return itemRect.height > 0 ? visibleHeight / itemRect.height : 0;
}

function isBlockInReadingZone(containerRect: DOMRect, blockRect: DOMRect) {
  const readingZoneTop = containerRect.top + BLOCK_READING_ZONE_TOP;
  const readingZoneBottom = containerRect.top + containerRect.height * BLOCK_READING_ZONE_HEIGHT_RATIO;
  return blockRect.top >= readingZoneTop && blockRect.top <= readingZoneBottom;
}

function scrollBlockIntoReadingZone(scroller: HTMLDivElement, block: HTMLElement) {
  const scrollerRect = scroller.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const targetTop = scroller.scrollTop + (blockRect.top - scrollerRect.top) - BLOCK_SCROLL_TARGET_OFFSET;
  scroller.scrollTo({
    top: Math.max(0, targetTop),
    behavior: 'smooth'
  });
}

export default function ScrollViewer() {
  const dispatch = useAppDispatch();
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { cache: textCache } = useAppSelector(selectPageTextWorkflow);
  const streamState = useAppSelector(selectStreamRuntime);
  const { autoFollowStream: autoFollowEnabled } = useAppSelector(selectStreamUiControls);
  const currentImage = manifest[currentPage] ?? null;
  const pageText = currentImage ? textCache[currentImage] ?? null : null;
  const { fetchPageTextByImage } = usePageText();
  const {
    invert,
    brightness,
    contrast
  } = settings;
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const internalPageRef = useRef(currentPage);
  const hasMountedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const pendingTextPrefetchRef = useRef<Set<string>>(new Set());
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
    const invertFilter = invert ? 'invert(1)' : 'invert(0)';
    const brightnessFilter = `brightness(${brightness}%)`;
    const contrastFilter = `contrast(${contrast}%)`;
    return `${invertFilter} ${brightnessFilter} ${contrastFilter}`;
  }, [brightness, contrast, invert]);
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';
  const streamPageKey = streamPositionActive ? streamState.pageKey : null;
  const setCurrentPageFromScroll = useCallback(
    (pageIndex: number) => {
      dispatch(appActions.setReaderCurrentPage(pageIndex));
      dispatch(appActions.setRegeneratedPageText(false));
      if (bookId) {
        saveLastPage(bookId, pageIndex);
      }
    },
    [bookId, dispatch]
  );
  const prefetchPageText = useCallback(
    (image: string | null | undefined) => {
      if (!image || textCache[image] || pendingTextPrefetchRef.current.has(image)) {
        return;
      }
      pendingTextPrefetchRef.current.add(image);
      void fetchPageTextByImage(image, { silent: true, updateCurrentState: false }).finally(() => {
        pendingTextPrefetchRef.current.delete(image);
      });
    },
    [fetchPageTextByImage, textCache]
  );

  const isPageSufficientlyVisible = (pageIndex: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return false;
    }
    const page = scroller.querySelector<HTMLElement>(
      `.scroll-viewer-page[data-page-index="${pageIndex}"]`
    );
    if (!page) {
      return false;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const visibleRatio = getVisibleRatio(scrollerRect, pageRect);
    const pageTopInViewport = pageRect.top >= scrollerRect.top && pageRect.top <= scrollerRect.bottom - PAGE_TOP_MARGIN;
    return visibleRatio >= PAGE_VISIBILITY_THRESHOLD || pageTopInViewport;
  };

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
    if (isPageSufficientlyVisible(currentPage)) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index: currentPage,
      align: 'start',
      behavior: 'smooth'
    });
  }, [currentPage, manifest.length]);

  useEffect(() => {
    const locator = parseStreamLocator(streamPageKey);
    if (!autoFollowEnabled || !locator?.imageUrl || manifest.length === 0) {
      return;
    }
    const pageIndex = manifest.findIndex((imageUrl) => imageUrl === locator.imageUrl);
    if (pageIndex < 0) {
      return;
    }
    internalPageRef.current = pageIndex;
    if (pageIndex !== currentPage) {
      setCurrentPageFromScroll(pageIndex);
    }
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    if (locator.blockId) {
      const block = scroller.querySelector<HTMLElement>(
        `.scroll-viewer-page[data-page-index="${pageIndex}"] [data-stream-block-id="${locator.blockId}"]`
      );
      if (block) {
        const scrollerRect = scroller.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const visibleRatio = getVisibleRatio(scrollerRect, blockRect);
        if (visibleRatio >= BLOCK_VISIBILITY_THRESHOLD || isBlockInReadingZone(scrollerRect, blockRect)) {
          return;
        }
        scrollBlockIntoReadingZone(scroller, block);
        return;
      }
    }
    if (isPageSufficientlyVisible(pageIndex)) {
      return;
    }
    virtuosoRef.current?.scrollToIndex({
      index: pageIndex,
      align: 'start',
      behavior: 'smooth'
    });
  }, [autoFollowEnabled, currentPage, manifest, setCurrentPageFromScroll, streamPageKey]);

  useEffect(() => {
    if (!streamPositionActive || manifest.length === 0) {
      return;
    }
    const locator = parseStreamLocator(streamPageKey);
    const activePageIndex = locator?.imageUrl
      ? manifest.findIndex((imageUrl) => imageUrl === locator.imageUrl)
      : currentPage;
    if (activePageIndex < 0) {
      return;
    }
    const end = Math.min(manifest.length - 1, activePageIndex + STREAM_TEXT_PREFETCH_AHEAD);
    for (let index = activePageIndex; index <= end; index += 1) {
      prefetchPageText(manifest[index]);
    }
  }, [currentPage, manifest, prefetchPageText, streamPageKey, streamPositionActive]);

  const updateCurrentPageFromViewport = () => {
    const scroller = scrollerRef.current;
    if (!hasMountedRef.current || manifest.length === 0 || !scroller) {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const readingLine = scrollerRect.top + Math.min(220, Math.max(120, scrollerRect.height * 0.22));
    const renderedPages = Array.from(
      scroller.querySelectorAll<HTMLElement>('.scroll-viewer-page[data-page-index]')
    );
    if (renderedPages.length === 0) {
      return;
    }
    let nextPage = currentPage;
    let bestDistance = Number.POSITIVE_INFINITY;
    let fallbackPage = currentPage;
    let fallbackBottom = Number.NEGATIVE_INFINITY;
    for (const page of renderedPages) {
      const rect = page.getBoundingClientRect();
      const pageIndex = Number.parseInt(page.dataset.pageIndex || String(currentPage), 10);
      if (rect.top <= readingLine && rect.bottom >= readingLine) {
        const distance = Math.abs(rect.top - readingLine);
        if (distance < bestDistance) {
          bestDistance = distance;
          nextPage = pageIndex;
        }
      }
      if (rect.top <= readingLine && rect.bottom > fallbackBottom) {
        fallbackBottom = rect.bottom;
        fallbackPage = pageIndex;
      }
    }
    if (bestDistance === Number.POSITIVE_INFINITY) {
      nextPage = fallbackPage;
    }
    internalPageRef.current = nextPage;
    if (nextPage !== currentPage) {
      setCurrentPageFromScroll(nextPage);
    }
  };

  const prefetchVisibleRange = (range: ListRange) => {
    const start = Math.max(0, range.startIndex - VIEWPORT_PREFETCH_PADDING);
    const end = Math.min(manifest.length - 1, range.endIndex + VIEWPORT_PREFETCH_PADDING);
    for (let index = start; index <= end; index += 1) {
      const image = manifest[index];
      prefetchPageText(image);
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
                  <OcrOverlay imageUrl={imageUrl} />
                ) : entry ? (
                  <OcrOverlay imageUrl={imageUrl} />
                ) : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
