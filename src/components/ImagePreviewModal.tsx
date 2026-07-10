import { useEffect } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import { useImagePreviewActions } from '@/hooks/useImagePreviewActions';
import { normalizeImageCaption } from '@/lib/imagePreview';
import {
  appActions,
  selectImagePreview,
  selectImagePreviewWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function ImagePreviewModal() {
  const dispatch = useAppDispatch();
  const { enhancePreview, showOriginal } = useImagePreviewActions();
  const preview = useAppSelector(selectImagePreview);
  const { enhancing, error } = useAppSelector(selectImagePreviewWorkflow);
  const open = preview !== null;
  const handleClose = () => {
    dispatch(appActions.closeImagePreview());
  };

  useEffect(() => {
    dispatch(appActions.resetImagePreviewStatus());
  }, [dispatch, open, preview?.cropUrl]);

  if (!open || !preview) {
    return null;
  }

  const caption = normalizeImageCaption(preview.caption);
  const displayUrl = preview.enhancedUrl ?? preview.cropUrl;

  return (
    <ModalShell ariaLabel="Image preview" onClose={handleClose} className="modal-image-preview">
        <header className="modal-header">
          <h2 className="modal-title">Image Preview</h2>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (enhancing) {
                  return;
                }
                void enhancePreview(preview);
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
                  void showOriginal(preview);
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
    </ModalShell>
  );
}
