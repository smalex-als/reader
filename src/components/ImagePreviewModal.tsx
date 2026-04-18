import { useEffect } from 'react';
import CloseIcon from '@/components/CloseIcon';
import type { ImagePreviewTarget } from '@/types/app';

interface ImagePreviewModalProps {
  open: boolean;
  preview: ImagePreviewTarget | null;
  onClose: () => void;
}

function normalizeCaption(caption: string | null | undefined) {
  const input = typeof caption === 'string' ? caption : '';
  const stripped = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || null;
}

export default function ImagePreviewModal({ open, preview, onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open || !preview) {
    return null;
  }

  const caption = normalizeCaption(preview.caption);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-image-preview">
        <header className="modal-header">
          <h2 className="modal-title">Image Preview</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            aria-label="Close image preview"
            title="Close image preview"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          <figure className="image-preview-figure">
            <img src={preview.cropUrl} alt={caption || 'Extracted image'} className="image-preview-image" />
            {caption ? <figcaption className="image-preview-caption">{caption}</figcaption> : null}
          </figure>
        </section>
      </div>
    </div>
  );
}
