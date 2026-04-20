import { useEffect, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import type { ImagePreviewTarget } from '@/types/app';

interface ImagePreviewModalProps {
  open: boolean;
  preview: ImagePreviewTarget | null;
  onEnhanced?: (url: string) => void;
  onClose: () => void;
}

function normalizeCaption(caption: string | null | undefined) {
  const input = typeof caption === 'string' ? caption : '';
  const stripped = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || null;
}

export default function ImagePreviewModal({ open, preview, onEnhanced, onClose }: ImagePreviewModalProps) {
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setEnhancing(false);
    setError(null);
  }, [open, preview?.cropUrl]);

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
                setEnhancing(true);
                setError(null);
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
                  onEnhanced?.(payload.url);
                } catch (fetchError) {
                  setError(fetchError instanceof Error ? fetchError.message : 'Unable to enhance image.');
                } finally {
                  setEnhancing(false);
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
                  onEnhanced?.('');
                }}
              >
                Show Original
              </button>
            ) : null}
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={onClose}
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
