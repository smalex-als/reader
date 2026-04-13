import { useId, useMemo } from 'react';
import type { PageText } from '@/types/app';

interface OcrOverlayProps {
  imageUrl: string;
  pageText: PageText | null;
  editMode: boolean;
  dimOutsideBlocks: boolean;
  dimOutsideBlocksIntensity: number;
  onPlayTextBlock: (payload: { imageUrl: string; startIndex: number; blockId: string }) => void;
  onToggleSpeechBlock: (blockId: string) => void;
}

const OCR_COORDINATE_SPACE = 1000;
const NON_INTERACTIVE_BLOCK_KINDS = new Set(['image', 'table']);

export default function OcrOverlay({
  imageUrl,
  pageText,
  editMode,
  dimOutsideBlocks,
  dimOutsideBlocksIntensity,
  onPlayTextBlock,
  onToggleSpeechBlock
}: OcrOverlayProps) {
  const overlayMaskId = useId().replace(/:/g, '-');

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
      (block) => !NON_INTERACTIVE_BLOCK_KINDS.has(block.kind.toLowerCase())
    );
    if (editMode) {
      return blocks.filter((block) => block.text.trim().length > 0);
    }
    return blocks.filter((block) => block.streamStartIndex !== null);
  }, [coordinateBlocks, editMode]);

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
                onPlayTextBlock({ imageUrl, startIndex: block.streamStartIndex, blockId: block.id });
              }
            }}
          />
        );
      })}
    </div>
  );
}
