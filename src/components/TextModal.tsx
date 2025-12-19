import { useEffect, useMemo, useState } from 'react';
import type { PageInsights, PageText } from '@/types/app';

interface TextModalProps {
  open: boolean;
  text: PageText | null;
  loading: boolean;
  insights: PageInsights | null;
  insightsLoading: boolean;
  notesStreamActive: boolean;
  onClose: () => void;
  title: string;
  onRegenerate: () => void;
  regenerated: boolean;
  onGenerateInsights: (force?: boolean) => void;
  onPlayNotes: () => void;
  onStopNotes: () => void;
}

export default function TextModal({
  open,
  text,
  loading,
  insights,
  insightsLoading,
  notesStreamActive,
  onClose,
  title,
  onRegenerate,
  regenerated,
  onGenerateInsights,
  onPlayNotes,
  onStopNotes
}: TextModalProps) {
  if (!open) {
    return null;
  }

  const generatedMarker = text?.source === 'ai' || regenerated;
  const hasNarration = Boolean(text?.narrationText?.trim());
  const hasSummary = Boolean(insights?.summary?.trim());
  const hasKeyPoints = Boolean(insights?.keyPoints?.length);
  const hasInsights = hasSummary || hasKeyPoints;
  const [view, setView] = useState<'narration' | 'original' | 'notes'>(
    hasNarration ? 'narration' : 'original'
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setView(hasNarration ? 'narration' : 'original');
  }, [hasNarration, open]);

  const displayedText = useMemo(() => {
    if (!text) {
      return '';
    }
    if (view === 'narration') {
      return text.narrationText || '';
    }
    return text.text || '';
  }, [text, view]);

  const summaryText = useMemo(() => {
    return insights?.summary?.trim() || '';
  }, [insights]);

  const keyPoints = useMemo(() => {
    return insights?.keyPoints ?? [];
  }, [insights]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">
            {title}
            {generatedMarker ? <span className="modal-marker">• Generated</span> : null}
          </h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading page text…</p>}
          {!loading && !text && <p className="modal-status">No text available.</p>}
          {!loading && text ? (
            <>
              <div className="modal-toolbar">
                <div className="segmented" role="tablist" aria-label="Text view">
                  <button
                    type="button"
                    className={`segmented-item ${view === 'original' ? 'segmented-item-active' : ''}`}
                    onClick={() => setView('original')}
                    disabled={loading}
                    role="tab"
                    aria-selected={view === 'original'}
                  >
                    Extracted
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${view === 'narration' ? 'segmented-item-active' : ''}`}
                    onClick={() => setView('narration')}
                    disabled={loading || !hasNarration}
                    role="tab"
                    aria-selected={view === 'narration'}
                  >
                    Narration
                  </button>
                  <button
                    type="button"
                    className={`segmented-item ${view === 'notes' ? 'segmented-item-active' : ''}`}
                    onClick={() => setView('notes')}
                    disabled={loading}
                    role="tab"
                    aria-selected={view === 'notes'}
                  >
                    Notes
                  </button>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => onGenerateInsights(hasInsights)}
                  disabled={loading || insightsLoading}
                >
                  {insightsLoading ? 'Generating…' : hasInsights ? 'Regenerate Notes' : 'Generate Notes'}
                </button>
                {view === 'notes' ? (
                  <button
                    type="button"
                    className="button"
                    onClick={notesStreamActive ? onStopNotes : onPlayNotes}
                    disabled={loading || insightsLoading}
                  >
                    {notesStreamActive ? 'Stop Notes' : 'Play Notes'}
                  </button>
                ) : null}
              </div>
              {view === 'narration' && !hasNarration ? (
                <p className="modal-status">No narration-adapted text available.</p>
              ) : null}
              {view === 'notes' && !summaryText && keyPoints.length === 0 && !insightsLoading ? (
                <p className="modal-status">No notes yet. Generate notes to create them.</p>
              ) : null}
              {insightsLoading && view === 'notes' ? (
                <p className="modal-status">Generating notes…</p>
              ) : null}
              {view === 'notes' && summaryText ? <p className="modal-prose">{summaryText}</p> : null}
              {view === 'notes' && keyPoints.length > 0 ? (
                <ul className="modal-list">
                  {keyPoints.map((point, index) => (
                    <li key={`${point}-${index}`}>{point}</li>
                  ))}
                </ul>
              ) : null}
              {view === 'original' || view === 'narration' ? (
                <pre className="modal-content">{displayedText}</pre>
              ) : null}
            </>
          ) : null}
        </section>
        <footer className="modal-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={onRegenerate}
            disabled={loading}
          >
            Regenerate
          </button>
          <button type="button" className="button button-primary" onClick={onClose} disabled={loading}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
