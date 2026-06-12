import { useCallback, useEffect, useMemo } from 'react';
import CloseIcon from '@/components/CloseIcon';
import { useListeningDashboardActions } from '@/hooks/useListeningDashboardActions';
import {
  appActions,
  selectListeningDashboardWorkflow,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Never';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ListeningDashboardModal() {
  useListeningDashboardActions();
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('listeningDashboard'));
  const { data, loading, error } = useAppSelector(selectListeningDashboardWorkflow);
  const handleClose = useCallback(() => {
    dispatch(appActions.closeModal('listeningDashboard'));
  }, [dispatch]);

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
  }, [handleClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dispatch(appActions.loadListeningDashboard());
  }, [dispatch, open]);

  const maxDaySeconds = useMemo(
    () => Math.max(1, ...((data?.byDay ?? []).map((entry) => entry.totalSeconds))),
    [data?.byDay]
  );
  const maxSourceSeconds = useMemo(
    () => Math.max(1, ...((data?.bySource ?? []).map((entry) => entry.totalSeconds))),
    [data?.bySource]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide modal-listening-dashboard">
        <header className="modal-header">
          <h2 className="modal-title">Listening Dashboard</h2>
          <div className="modal-actions">
            {data ? (
              <span className="toolbar-readout">Updated {formatDateTime(data.generatedAt)}</span>
            ) : null}
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
              aria-label="Close dashboard"
              title="Close dashboard"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body listening-dashboard-body">
          {loading ? <p className="modal-status">Loading listening dashboard…</p> : null}
          {!loading && error ? <p className="modal-status">{error}</p> : null}
          {!loading && !error && data ? (
            <div className="listening-dashboard">
              <section className="listening-dashboard-grid">
                <article className="listening-stat-card">
                  <span className="listening-stat-label">Total Time</span>
                  <strong className="listening-stat-value">{formatDuration(data.totals.totalSeconds)}</strong>
                </article>
                <article className="listening-stat-card">
                  <span className="listening-stat-label">Sessions</span>
                  <strong className="listening-stat-value">{data.totals.sessions}</strong>
                </article>
                <article className="listening-stat-card">
                  <span className="listening-stat-label">Average Session</span>
                  <strong className="listening-stat-value">{formatDuration(data.totals.averageSeconds)}</strong>
                </article>
                <article className="listening-stat-card">
                  <span className="listening-stat-label">Active Days</span>
                  <strong className="listening-stat-value">{data.totals.daysActive}</strong>
                </article>
              </section>

              <section className="listening-dashboard-columns">
                <article className="listening-panel">
                  <h3 className="listening-panel-title">Daily Listening</h3>
                  <div className="listening-bars">
                    {data.byDay.length === 0 ? <p className="modal-status">No listening history yet.</p> : null}
                    {data.byDay.map((entry) => (
                      <div key={entry.date} className="listening-bar-row">
                        <span className="listening-bar-label">{formatDay(entry.date)}</span>
                        <div className="listening-bar-track">
                          <div
                            className="listening-bar-fill"
                            style={{ width: `${(entry.totalSeconds / maxDaySeconds) * 100}%` }}
                          />
                        </div>
                        <span className="listening-bar-value">
                          {formatDuration(entry.totalSeconds)} · {entry.sessions}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="listening-panel">
                  <h3 className="listening-panel-title">Source Breakdown</h3>
                  <div className="listening-bars">
                    {data.bySource.map((entry) => (
                      <div key={entry.sourceType} className="listening-bar-row">
                        <span className="listening-bar-label">{entry.label}</span>
                        <div className="listening-bar-track">
                          <div
                            className="listening-bar-fill listening-bar-fill-accent"
                            style={{ width: `${(entry.totalSeconds / maxSourceSeconds) * 100}%` }}
                          />
                        </div>
                        <span className="listening-bar-value">
                          {formatDuration(entry.totalSeconds)} · {entry.sessions}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="listening-dashboard-columns">
                <article className="listening-panel">
                  <h3 className="listening-panel-title">Top Books</h3>
                  <div className="listening-table">
                    {data.topBooks.map((entry) => (
                      <button
                        key={entry.bookId}
                        type="button"
                        className="listening-table-row listening-table-button"
                        onClick={() => dispatch(appActions.requestDashboardBookNavigation(entry.bookId))}
                      >
                        <div className="listening-table-main">
                          <strong>{entry.bookId}</strong>
                          <span>{entry.sessions} sessions</span>
                        </div>
                        <div className="listening-table-meta">
                          <strong>{formatDuration(entry.totalSeconds)}</strong>
                          <span>{formatDateTime(entry.lastListenedAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="listening-panel">
                  <h3 className="listening-panel-title">Top Chapters</h3>
                  <div className="listening-table">
                    {data.topChapters.map((entry, index) => (
                      <button
                        key={`${entry.bookId}-${entry.chapterNumber ?? 'none'}-${index}`}
                        type="button"
                        className="listening-table-row listening-table-button"
                        onClick={() =>
                          dispatch(appActions.requestDashboardChapterNavigation(
                            entry.bookId,
                            entry.chapterNumber,
                            entry.subchapterTitle,
                            entry.pageNumber,
                            entry.pageKeyEnd
                          ))
                        }
                      >
                        <div className="listening-table-main">
                          <strong>
                            {entry.chapterTitle ?? `Chapter ${entry.chapterNumber ?? 'Unknown'}`}
                            {entry.subchapterTitle ? ` · ${entry.subchapterTitle}` : ''}
                          </strong>
                          <span>{entry.bookId}</span>
                        </div>
                        <div className="listening-table-meta">
                          <strong>{formatDuration(entry.totalSeconds)}</strong>
                          <span>{entry.sessions} sessions</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </article>
              </section>

              {data.topUnits.length > 0 ? (
                <section className="listening-panel">
                  <h3 className="listening-panel-title">Top Units</h3>
                  <div className="listening-table">
                    {data.topUnits.map((entry) => (
                      <button
                        key={`${entry.unitSetId}-${entry.topicId}`}
                        type="button"
                        className="listening-table-row listening-table-button"
                        onClick={() =>
                          dispatch(appActions.requestDashboardUnitNavigation(entry.unitSetId, entry.topicId))
                        }
                      >
                        <div className="listening-table-main">
                          <strong>{entry.topicTitle ?? entry.topicId}</strong>
                          <span>{entry.unitSetTitle ?? entry.unitSetId}</span>
                        </div>
                        <div className="listening-table-meta">
                          <strong>{formatDuration(entry.totalSeconds)}</strong>
                          <span>{entry.sessions} sessions</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="listening-panel">
                <h3 className="listening-panel-title">Recent Sessions</h3>
                <div className="listening-table listening-table-compact">
                  {data.recentSessions.map((entry, index) => (
                    <button
                      key={`${entry.timestamp}-${entry.bookId}-${index}`}
                      type="button"
                      className="listening-table-row listening-table-row-multiline listening-table-button"
                      onClick={() =>
                        entry.sourceType === 'unit' && entry.unitSetId && entry.topicId
                          ? dispatch(appActions.requestDashboardUnitNavigation(entry.unitSetId, entry.topicId))
                          : entry.chapterNumber !== null
                          ? dispatch(appActions.requestDashboardChapterNavigation(
                              entry.bookId,
                              entry.chapterNumber,
                              entry.subchapterTitle,
                              entry.pageNumber,
                              entry.pageKeyEnd
                            ))
                          : dispatch(appActions.requestDashboardBookNavigation(entry.bookId))
                      }
                    >
                      <div className="listening-table-main">
                        <strong>
                          {entry.sourceType === 'unit'
                            ? entry.topicTitle ?? entry.topicId ?? entry.bookId
                            : entry.chapterTitle ?? entry.bookId}
                          {entry.subchapterTitle ? ` · ${entry.subchapterTitle}` : ''}
                        </strong>
                        <span>
                          {entry.sourceType === 'unit'
                            ? entry.unitSetTitle ?? entry.unitSetId ?? entry.bookId
                            : entry.bookId}
                          {' · '}
                          {entry.sourceLabel}
                        </span>
                      </div>
                      <div className="listening-table-meta">
                        <strong>{formatDuration(entry.listenedSeconds)}</strong>
                        <span>
                          {entry.endReason} · {formatDateTime(entry.timestamp)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
