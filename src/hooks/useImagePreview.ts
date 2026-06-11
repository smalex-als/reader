import { useCallback } from 'react';
import {
  appActions,
  selectImagePreview,
  selectImagePreviewWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function makePreviewKey(
  bookId: string,
  imageFilename: string,
  bounds: [number, number, number, number]
) {
  const [left, top, right, bottom] = bounds;
  return `${bookId}:${imageFilename}:${left}:${top}:${right}:${bottom}`;
}

export function useImagePreview({ bookId }: { bookId: string | null }) {
  const dispatch = useAppDispatch();
  const imagePreview = useAppSelector(selectImagePreview);
  const { enhancedUrls } = useAppSelector(selectImagePreviewWorkflow);

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
      dispatch(appActions.openImagePreview({
        bookId,
        imageFilename,
        imageUrl: payload.imageUrl,
        bounds: payload.bounds,
        caption: payload.caption ?? null,
        cropUrl: `/api/books/${encodeURIComponent(bookId)}/image-preview?${params.toString()}`,
        enhancedUrl: enhancedUrls[previewKey] ?? null
      }));
    },
    [bookId, dispatch, enhancedUrls]
  );

  const handleImagePreviewEnhanced = useCallback(
    (url: string) => {
      if (!imagePreview) {
        return;
      }
      const previewKey = makePreviewKey(imagePreview.bookId, imagePreview.imageFilename, imagePreview.bounds);
      dispatch(appActions.setImagePreviewCachedEnhancedUrl(previewKey, url || null));
      dispatch(appActions.setImagePreviewEnhancedUrl(url || null));
    },
    [dispatch, imagePreview]
  );

  const closeImagePreview = useCallback(() => {
    dispatch(appActions.closeImagePreview());
  }, [dispatch]);

  return {
    imagePreview,
    handleOpenImagePreview,
    handleImagePreviewEnhanced,
    closeImagePreview
  };
}
