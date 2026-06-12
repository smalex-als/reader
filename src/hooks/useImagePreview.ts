import { useCallback } from 'react';
import { makeImagePreviewKey } from '@/lib/imagePreview';
import {
  appActions,
  selectImagePreviewWorkflow,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useImagePreview() {
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
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
      const previewKey = makeImagePreviewKey(bookId, imageFilename, payload.bounds);
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
