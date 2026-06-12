import { useEffect, useId, useMemo } from 'react';
import { useImagePreview } from '@/hooks/useImagePreview';
import { usePageText } from '@/hooks/usePageText';
import { useReaderCommands } from '@/hooks/useReaderCommands';
import { parseStreamLocator } from '@/lib/streamLocator';
import {
  selectBookSessionWorkflow,
  selectOcrEdit,
  selectReaderSession,
  selectStreamRuntime,
  selectStreamUiControls,
  selectViewerWorkflow,
  useAppSelector
} from '@/state/appState';

interface OcrOverlayProps {
  imageUrl: string;
}

const OCR_COORDINATE_SPACE = 1000;
const NON_INTERACTIVE_BLOCK_KINDS = new Set(['image', 'table']);
const PREVIEWABLE_BLOCK_KINDS = new Set(['image', 'image_caption']);

export default function OcrOverlay({ imageUrl }: OcrOverlayProps) {
  const { playOcrBlock, toggleOcrBlockSpeech } = useReaderCommands();
  const { currentPage } = useAppSelector(selectReaderSession);
  const { manifest } = useAppSelector(selectBookSessionWorkflow);
  const { currentText: pageText, fetchPageText } = usePageText(imageUrl);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { editMode: globalEditMode } = useAppSelector(selectOcrEdit);
  const streamState = useAppSelector(selectStreamRuntime);
  const { selectedStreamBlockKey } = useAppSelector(selectStreamUiControls);
  const { handleOpenImagePreview } = useImagePreview();
  const currentImage = manifest[currentPage] ?? null;
  const editMode = globalEditMode && imageUrl === currentImage;
  const {
    dimOutsideBlocks,
    dimOutsideBlocksIntensity
  } = settings;
  const overlayMaskId = useId().replace(/:/g, '-');
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';
  const playingStreamLocator = useMemo(
    () => parseStreamLocator(streamPositionActive ? streamState.pageKey : null),
    [streamPositionActive, streamState.pageKey]
  );
  const selectedStreamLocator = useMemo(
    () => parseStreamLocator(selectedStreamBlockKey),
    [selectedStreamBlockKey]
  );
  const activeStreamLocator = playingStreamLocator ?? selectedStreamLocator;
  const currentBlockId = activeStreamLocator?.imageUrl === imageUrl ? activeStreamLocator.blockId : null;
  const playingBlockId = playingStreamLocator?.imageUrl === imageUrl ? playingStreamLocator.blockId : null;

  useEffect(() => {
    if (pageText) {
      return;
    }
    void fetchPageText({ silent: true });
  }, [fetchPageText, pageText]);

  const coordinateBlocks = useMemo(() => {
    return (pageText?.blocks ?? []).filter((block) => {
      const bounds = block.bounds;
      return (
        Array.isArray(bounds) &&
        bounds.length === 4 &&
        bounds.every((value) => Number.isFinite(value))
      );
    });
  }, [pageText]);

  const interactiveBlocks = useMemo(() => {
    const blocks = coordinateBlocks.filter(
      (block) =>
        !NON_INTERACTIVE_BLOCK_KINDS.has(block.kind.toLowerCase()) &&
        !PREVIEWABLE_BLOCK_KINDS.has(block.kind.toLowerCase())
    );
    if (editMode) {
      return blocks.filter((block) => block.text.trim().length > 0);
    }
    return blocks.filter((block) => block.streamStartIndex !== null);
  }, [coordinateBlocks, editMode]);

  const previewBlocks = useMemo(() => {
    if (editMode) {
      return [];
    }
    return coordinateBlocks.filter((block) => PREVIEWABLE_BLOCK_KINDS.has(block.kind.toLowerCase()));
  }, [coordinateBlocks, editMode]);

  const imageBlocks = useMemo(
    () => coordinateBlocks.filter((block) => block.kind.toLowerCase() === 'image'),
    [coordinateBlocks]
  );

  const resolveImagePreview = useMemo(() => {
    const findClosestImageBlock = (targetBlockId: string) => {
      const targetBlock = coordinateBlocks.find((block) => block.id === targetBlockId);
      if (!targetBlock || imageBlocks.length === 0) {
        return null;
      }
      if (targetBlock.kind.toLowerCase() === 'image') {
        return targetBlock;
      }
      const [left, top, right, bottom] = targetBlock.bounds;
      const centerX = (left + right) / 2;
      const centerY = (top + bottom) / 2;
      let closest = imageBlocks[0];
      let closestScore = Number.POSITIVE_INFINITY;
      for (const imageBlock of imageBlocks) {
        const [imageLeft, imageTop, imageRight, imageBottom] = imageBlock.bounds;
        const imageCenterX = (imageLeft + imageRight) / 2;
        const imageCenterY = (imageTop + imageBottom) / 2;
        const score = Math.abs(imageCenterY - centerY) + Math.abs(imageCenterX - centerX) * 0.35;
        if (score < closestScore) {
          closest = imageBlock;
          closestScore = score;
        }
      }
      return closest;
    };

    const findCaptionForImage = (targetImageId: string) => {
      const targetImage = imageBlocks.find((block) => block.id === targetImageId);
      if (!targetImage) {
        return null;
      }
      const captions = coordinateBlocks.filter((block) => block.kind.toLowerCase() === 'image_caption');
      if (captions.length === 0) {
        return null;
      }
      const [imageLeft, imageTop, imageRight, imageBottom] = targetImage.bounds;
      let closest = null;
      let closestScore = Number.POSITIVE_INFINITY;
      for (const captionBlock of captions) {
        const [captionLeft, captionTop, captionRight, captionBottom] = captionBlock.bounds;
        const verticalGap = Math.abs(captionTop - imageBottom);
        const horizontalGap = Math.abs((captionLeft + captionRight) / 2 - (imageLeft + imageRight) / 2);
        const overlap =
          Math.max(0, Math.min(imageRight, captionRight) - Math.max(imageLeft, captionLeft)) /
          Math.max(1, imageRight - imageLeft);
        const score = verticalGap + horizontalGap * 0.2 - overlap * 120;
        if (score < closestScore) {
          closest = captionBlock;
          closestScore = score;
        }
      }
      return closest;
    };

    return (blockId: string) => {
      const clickedBlock = coordinateBlocks.find((block) => block.id === blockId);
      if (!clickedBlock) {
        return null;
      }
      const imageBlock = findClosestImageBlock(blockId);
      if (!imageBlock) {
        return null;
      }
      const captionBlock =
        clickedBlock.kind.toLowerCase() === 'image_caption'
          ? clickedBlock
          : findCaptionForImage(imageBlock.id);
      return {
        bounds: imageBlock.bounds,
        caption: captionBlock?.text?.trim() || null
      };
    };
  }, [coordinateBlocks, imageBlocks]);

  const shouldShowDimOverlay = dimOutsideBlocks && (!pageText || coordinateBlocks.length > 0);

  if (!shouldShowDimOverlay) {
    return null;
  }

  return (
    <div className="viewer-image-map" style={{ width: '100%', height: '100%' }}>
      <svg
        className="viewer-dim-overlay"
        viewBox={`0 0 ${OCR_COORDINATE_SPACE} ${OCR_COORDINATE_SPACE}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ opacity: 1 }}
      >
        {coordinateBlocks.length > 0 ? (
          <>
            <defs>
              <mask id={overlayMaskId}>
                <rect width={OCR_COORDINATE_SPACE} height={OCR_COORDINATE_SPACE} fill="white" />
                {coordinateBlocks.map((block) => {
                  const [left, top, right, bottom] = block.bounds;
                  return (
                    <rect
                      key={`mask-${block.id}`}
                      x={left}
                      y={top}
                      width={Math.max(1, right - left)}
                      height={Math.max(1, bottom - top)}
                      fill="black"
                    />
                  );
                })}
              </mask>
              <clipPath id={`${overlayMaskId}-blocks`}>
                {coordinateBlocks.map((block) => {
                  const [left, top, right, bottom] = block.bounds;
                  return (
                    <rect
                      key={`clip-${block.id}`}
                      x={left}
                      y={top}
                      width={Math.max(1, right - left)}
                      height={Math.max(1, bottom - top)}
                    />
                  );
                })}
              </clipPath>
            </defs>
            <rect
              width={OCR_COORDINATE_SPACE}
              height={OCR_COORDINATE_SPACE}
              fill={`rgba(196, 170, 110, ${dimOutsideBlocksIntensity / 100})`}
              mask={`url(#${overlayMaskId})`}
            />
            <rect
              width={OCR_COORDINATE_SPACE}
              height={OCR_COORDINATE_SPACE}
              fill={`rgba(196, 170, 110, ${dimOutsideBlocksIntensity / 110})`}
              clipPath={`url(#${overlayMaskId}-blocks)`}
            />
          </>
        ) : (
          <rect
            width={OCR_COORDINATE_SPACE}
            height={OCR_COORDINATE_SPACE}
            fill={`rgba(196, 170, 110, ${dimOutsideBlocksIntensity / 100})`}
          />
        )}
      </svg>
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
              left: `${(left / OCR_COORDINATE_SPACE) * 100}%`,
              top: `${(top / OCR_COORDINATE_SPACE) * 100}%`,
              width: `${(width / OCR_COORDINATE_SPACE) * 100}%`,
              height: `${(height / OCR_COORDINATE_SPACE) * 100}%`
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
            data-current={currentBlockId === block.id ? 'true' : 'false'}
            data-playing={playingBlockId === block.id ? 'true' : 'false'}
            data-stream-block-id={block.id}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (editMode) {
                toggleOcrBlockSpeech(block.id);
                return;
              }
              if (block.streamStartIndex !== null) {
                playOcrBlock({
                  imageUrl,
                  startIndex: block.streamStartIndex,
                  blockId: block.id
                });
              }
            }}
          />
        );
      })}
      {previewBlocks.map((block) => {
        const [left, top, right, bottom] = block.bounds;
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);
        return (
          <button
            key={`preview-${block.id}`}
            type="button"
            className="viewer-hotspot"
            style={{
              left: `${(left / OCR_COORDINATE_SPACE) * 100}%`,
              top: `${(top / OCR_COORDINATE_SPACE) * 100}%`,
              width: `${(width / OCR_COORDINATE_SPACE) * 100}%`,
              height: `${(height / OCR_COORDINATE_SPACE) * 100}%`
            }}
            aria-label="Open image preview"
            title="Open image preview"
            data-preview={block.kind.toLowerCase()}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              const preview = resolveImagePreview(block.id);
              if (!preview) {
                return;
              }
              handleOpenImagePreview({
                imageUrl,
                bounds: preview.bounds,
                caption: preview.caption
              });
            }}
          />
        );
      })}
    </div>
  );
}
