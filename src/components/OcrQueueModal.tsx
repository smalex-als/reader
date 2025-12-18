import type { OcrJob } from '@/hooks/useOcrQueue';

interface OcrQueueModalProps {
  open: boolean;
  onClose: () => void;
  jobs: OcrJob[];
  paused: boolean;
  onTogglePause: () => void;
  onQueueAll: () => void;
  onQueueRemaining: () => void;
  onQueueCurrent: () => void;
  onRetryFailed: () => void;
  onClearQueue: () => void;
}

function getStatusLabel(status: OcrJob['status']) {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'error':
      return 'Failed';
    default:
      return 'Queued';
  }
}

export default function OcrQueueModal({
  open,
  onClose,
  jobs,
  paused,
  onTogglePause,
  onQueueAll,
  onQueueRemaining,
  onQueueCurrent,
  onRetryFailed,
  onClearQueue
}: OcrQueueModalProps) {
  if (!open) {
    return null;
  }

  const total = jobs.length;
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const failed = jobs.filter((job) => job.status === 'error').length;
  const pending = jobs.filter((job) => job.status === 'pending').length;
  const running = jobs.some((job) => job.status === 'running');
  const processed = completed + failed;
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
  const statusLabel = paused
    ? 'Paused'
    : running
    ? 'Running'
    : pending > 0
    ? 'Queued'
    : total > 0
    ? 'Complete'
    : 'Idle';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">
            Batch OCR
            <span className={`ocr-status ocr-status-${statusLabel.toLowerCase()}`}>{statusLabel}</span>
          </h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          <div className="modal-toolbar">
            <button type="button" className="button" onClick={onQueueCurrent}>
              Queue Current
            </button>
            <button type="button" className="button" onClick={onQueueRemaining}>
              Queue Remaining
            </button>
            <button type="button" className="button" onClick={onQueueAll}>
              Queue All
            </button>
            <button type="button" className="button" onClick={onRetryFailed} disabled={failed === 0}>
              Retry Failed
            </button>
            <button type="button" className="button button-ghost" onClick={onClearQueue} disabled={total === 0}>
              Clear
            </button>
          </div>
          <div className="ocr-progress">
            <div className="ocr-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="ocr-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="ocr-progress-meta">
              {total === 0 ? (
                <span>No pages queued.</span>
              ) : (
                <span>
                  Processed {processed} of {total}
                  {failed > 0 ? ` · ${failed} failed` : ''}
                </span>
              )}
            </div>
          </div>
          <ul className="ocr-queue-list">
            {total === 0 ? (
              <li className="ocr-queue-empty">Queue is empty.</li>
            ) : (
              jobs.map((job) => {
                const filename = job.imageUrl.split('/').pop() || job.imageUrl;
                return (
                  <li key={job.id} className="ocr-queue-item">
                    <div className="ocr-queue-meta">
                      <span className="ocr-queue-title">Page {job.pageIndex + 1}</span>
                      <span className="ocr-queue-subtitle">{filename}</span>
                    </div>
                    <span className={`ocr-queue-status ocr-queue-status-${job.status}`}>
                      {getStatusLabel(job.status)}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </section>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={onTogglePause}
            disabled={total === 0 && !paused}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
