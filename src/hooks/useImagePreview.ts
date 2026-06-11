import { useCallback } from 'react';
import {
  appActions,
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

  return {
    handleOpenImagePreview
  };
}
