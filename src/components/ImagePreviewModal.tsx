import { useEffect } from 'react';
import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectImagePreview,
  selectImagePreviewWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function normalizeCaption(caption: string | null | undefined) {
  const input = typeof caption === 'string' ? caption : '';
  const stripped = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || null;
}

function makePreviewKey(
  bookId: string,
  imageFilename: string,
  bounds: [number, number, number, number]
) {
  const [left, top, right, bottom] = bounds;
  return `${bookId}:${imageFilename}:${left}:${top}:${right}:${bottom}`;
}

export default function ImagePreviewModal() {
  const dispatch = useAppDispatch();
  const preview = useAppSelector(selectImagePreview);
  const { enhancing, error } = useAppSelector(selectImagePreviewWorkflow);
  const open = preview !== null;
  const handleClose = () => {
    dispatch(appActions.closeImagePreview());
  };
  const handleEnhancedUrl = (url: string | null) => {
    if (!preview) {
      return;
    }
    const previewKey = makePreviewKey(preview.bookId, preview.imageFilename, preview.bounds);
    dispatch(appActions.setImagePreviewCachedEnhancedUrl(previewKey, url));
    dispatch(appActions.setImagePreviewEnhancedUrl(url));
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    dispatch(appActions.resetImagePreviewStatus());
  }, [dispatch, open, preview?.cropUrl]);

  if (!open || !preview) {
    return null;
  }

  const caption = normalizeCaption(preview.caption);
  const displayUrl = preview.enhancedUrl ?? preview.cropUrl;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-image-preview">
        <header className="modal-header">
          <h2 className="modal-title">Image Preview</h2>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={async () => {
                if (enhancing) {
                  return;
                }
                dispatch(appActions.setImagePreviewEnhancing(true));
                dispatch(appActions.setImagePreviewError(null));
                try {
                  const response = await fetch(
                    `/api/books/${encodeURIComponent(preview.bookId)}/image-preview/enhance`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        image: preview.imageFilename,
                        bounds: preview.bounds,
                        caption: caption ?? preview.caption ?? null
                      })
                    }
                  );
                  if (!response.ok) {
                    throw new Error(`Enhancement failed (${response.status})`);
                  }
                  const payload = (await response.json()) as { url?: string };
                  if (!payload.url) {
                    throw new Error('Enhanced image URL is missing');
                  }
                  handleEnhancedUrl(payload.url);
                } catch (fetchError) {
                  dispatch(appActions.setImagePreviewError(
                    fetchError instanceof Error ? fetchError.message : 'Unable to enhance image.'
                  ));
                } finally {
                  dispatch(appActions.setImagePreviewEnhancing(false));
                }
              }}
              disabled={enhancing}
            >
              {enhancing ? 'Enhancing…' : 'Enhance'}
            </button>
            {preview.enhancedUrl ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  handleEnhancedUrl(null);
                }}
              >
                Show Original
              </button>
            ) : null}
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
              aria-label="Close image preview"
              title="Close image preview"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body">
          <figure className="image-preview-figure">
            <img src={displayUrl} alt={caption || 'Extracted image'} className="image-preview-image" />
            {caption ? <figcaption className="image-preview-caption">{caption}</figcaption> : null}
            {error ? <p className="modal-status">{error}</p> : null}
          </figure>
        </section>
      </div>
    </div>
  );
}
