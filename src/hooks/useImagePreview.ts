import { useCallback, useState } from 'react';
import type { ImagePreviewTarget } from '@/types/app';

function makePreviewKey(
  bookId: string,
  imageFilename: string,
  bounds: [number, number, number, number]
) {
  const [left, top, right, bottom] = bounds;
  return `${bookId}:${imageFilename}:${left}:${top}:${right}:${bottom}`;
}

export function useImagePreview({ bookId }: { bookId: string | null }) {
  const [imagePreview, setImagePreview] = useState<ImagePreviewTarget | null>(null);
  const [enhancedImagePreviewUrls, setEnhancedImagePreviewUrls] = useState<Record<string, string>>({});

  const handleOpenImagePreview = useCallback(
    (payload: { imageUrl: string; bounds: [number, number, number, number]; caption?: string | null }) => {
      if (!bookId) {
        return;
      }
      const imageFilename = payload.imageUrl.split('/').pop();
      if (!imageFilename) {
        return;
      }
      const [left, top, right, bottom] = payload.bounds;
      const params = new URLSearchParams({
        image: imageFilename,
        left: String(left),
        top: String(top),
        right: String(right),
        bottom: String(bottom)
      });
      const previewKey = makePreviewKey(bookId, imageFilename, payload.bounds);
      setImagePreview({
        bookId,
        imageFilename,
        imageUrl: payload.imageUrl,
        bounds: payload.bounds,
        caption: payload.caption ?? null,
        cropUrl: `/api/books/${encodeURIComponent(bookId)}/image-preview?${params.toString()}`,
        enhancedUrl: enhancedImagePreviewUrls[previewKey] ?? null
      });
    },
    [bookId, enhancedImagePreviewUrls]
  );

  const handleImagePreviewEnhanced = useCallback(
    (url: string) => {
      if (!imagePreview) {
        return;
      }
      const previewKey = makePreviewKey(imagePreview.bookId, imagePreview.imageFilename, imagePreview.bounds);
      setEnhancedImagePreviewUrls((prev) => {
        if (!url) {
          const next = { ...prev };
          delete next[previewKey];
          return next;
        }
        return { ...prev, [previewKey]: url };
      });
      setImagePreview((current) =>
        current
          ? {
              ...current,
              enhancedUrl: url || null
            }
          : current
      );
    },
    [imagePreview]
  );

  const closeImagePreview = useCallback(() => setImagePreview(null), []);

  return {
    imagePreview,
    handleOpenImagePreview,
    handleImagePreviewEnhanced,
    closeImagePreview
  };
}
