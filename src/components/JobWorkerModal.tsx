import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';

type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

interface JobWorkerJob {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  errorDetails: unknown;
  result: unknown;
  logs: Array<{ timestamp: string; message: string; details: unknown }>;
  payload: Record<string, unknown>;
}

interface JobWorkerModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatJobTitle(job: JobWorkerJob) {
  if (job.type === 'chapter_subtitles') {
    const bookId = typeof job.payload.bookId === 'string' ? job.payload.bookId : 'book';
    const chapterNumber =
      typeof job.payload.chapterNumber === 'number' ? `chapter ${job.payload.chapterNumber}` : 'chapter';
    const versionId = typeof job.payload.versionId === 'string' ? job.payload.versionId : 'base';
    return `${bookId} · ${chapterNumber} · ${versionId}`;
  }
  return job.type;
}

function stringifyLog(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function getStatusLabel(status: JobStatus) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export default function JobWorkerModal({ open, onClose }: JobWorkerModalProps) {
  const [jobs, setJobs] = useState<JobWorkerJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/jobs');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `Failed to load jobs: HTTP ${response.status}`);
      }
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadJobs();
    const timer = window.setInterval(() => {
      void loadJobs();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [loadJobs, open]);

  const counts = useMemo(
    () => ({
      queued: jobs.filter((job) => job.status === 'queued').length,
      running: jobs.filter((job) => job.status === 'running').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length
    }),
    [jobs]
  );
  const visibleJobs = useMemo(() => {
    const statusRank: Record<JobStatus, number> = {
      running: 0,
      queued: 1,
      failed: 2,
      completed: 3
    };
    return [...jobs].sort((left, right) => {
      const rankDiff = statusRank[left.status] - statusRank[right.status];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return (
        new Date(right.updatedAt || right.createdAt).getTime() -
        new Date(left.updatedAt || left.createdAt).getTime()
      );
    });
  }, [jobs]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-job-worker">
        <header className="modal-header">
          <h2 className="modal-title">
            Job Worker
            {counts.running > 0 ? <span className="ocr-status ocr-status-running">Running</span> : null}
          </h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            aria-label="Close job worker"
            title="Close job worker"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body job-worker-body">
          <div className="modal-toolbar">
            <button type="button" className="button" onClick={() => void loadJobs()} disabled={loading}>
              Refresh
            </button>
            <span className="toolbar-readout">
              Queued {counts.queued} · Running {counts.running} · Done {counts.completed} · Failed {counts.failed}
            </span>
          </div>
          {error ? <div className="job-worker-error">{error}</div> : null}
          <ul className="job-worker-list">
            {visibleJobs.length === 0 ? (
              <li className="ocr-queue-empty">{loading ? 'Loading jobs…' : 'No jobs.'}</li>
            ) : (
              visibleJobs.map((job) => {
                const details = stringifyLog({
                  payload: job.payload,
                  result: job.result,
                  error: job.error,
                  errorDetails: job.errorDetails,
                  logs: job.logs
                });
                return (
                  <li key={job.id} className="job-worker-item">
                    <div className="job-worker-item-header">
                      <div className="ocr-queue-meta">
                        <span className="ocr-queue-title">{formatJobTitle(job)}</span>
                        <span className="ocr-queue-subtitle">
                          {job.type} · attempts {job.attempts} · updated {formatDate(job.updatedAt)}
                        </span>
                      </div>
                      <span className={`ocr-queue-status ocr-queue-status-${job.status}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </div>
                    <div className="job-worker-times">
                      <span>Created {formatDate(job.createdAt)}</span>
                      <span>Started {formatDate(job.startedAt)}</span>
                      <span>Completed {formatDate(job.completedAt)}</span>
                    </div>
                    {job.error ? <div className="job-worker-error">{job.error}</div> : null}
                    <details className="job-worker-details">
                      <summary>Logs</summary>
                      <pre className="job-worker-log">{details}</pre>
                    </details>
                  </li>
                );
              })
            )}
          </ul>
        </section>
        <footer className="modal-footer modal-footer-right">
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
