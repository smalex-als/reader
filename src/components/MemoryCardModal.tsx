import { useEffect } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChapterMemoryCard, StreamState } from '@/types/app';

interface MemoryCardModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  chapterLabel: string;
  memoryCard: ChapterMemoryCard | null;
  streamState: StreamState;
  onCopyText: (text: string) => void;
  onPlayAudio: (text: string, chapterNumber: number) => void;
  onStopAudio: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}

export default function MemoryCardModal({
  open,
  loading,
  error,
  chapterLabel,
  memoryCard,
  streamState,
  onCopyText,
  onPlayAudio,
  onStopAudio,
  onRegenerate,
  onClose
}: MemoryCardModalProps) {
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

  const streamPrefix = memoryCard ? `memory-card::chapter-${memoryCard.chapterNumber}` : null;
  const isStreaming =
    !!streamPrefix &&
    (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused') &&
    typeof streamState.pageKey === 'string' &&
    streamState.pageKey.startsWith(streamPrefix);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-vocabulary">
        <header className="modal-header">
          <h2 className="modal-title">
            Memory Card
            <span className="modal-marker">• {chapterLabel}</span>
          </h2>
          <div className="modal-actions">
            <button
              type="button"
              className={`button button-secondary modal-icon-button ${isStreaming ? 'button-active' : ''}`}
              onClick={() => {
                if (!memoryCard?.text) {
                  return;
                }
                if (isStreaming) {
                  onStopAudio();
                  return;
                }
                onPlayAudio(memoryCard.text, memoryCard.chapterNumber);
              }}
              disabled={!memoryCard || loading}
              aria-label={isStreaming ? 'Stop audio' : 'Play audio'}
              title={isStreaming ? 'Stop audio' : 'Play audio'}
            >
              {isStreaming ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="button button-secondary modal-icon-button"
              onClick={() => {
                if (!memoryCard?.text) {
                  return;
                }
                onCopyText(memoryCard.text);
              }}
              disabled={!memoryCard || loading}
              aria-label="Copy text"
              title="Copy text"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="9" y="9" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <rect x="5" y="5" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              className="button button-secondary modal-action-button"
              onClick={onRegenerate}
              disabled={loading}
            >
              Regenerate
            </button>
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={onClose}
              aria-label="Close memory card"
              title="Close memory card"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body">
          {loading ? <p className="modal-status">Generating memory card…</p> : null}
          {!loading && error ? <p className="modal-status">{error}</p> : null}
          {!loading && !error && !memoryCard ? <p className="modal-status">No memory card available.</p> : null}
          {!loading && !error && memoryCard ? (
            <div className="study-vocabulary">
              <div className="study-vocabulary-header">
                <span className="toolbar-readout">{memoryCard.title}</span>
                <span className="toolbar-readout">Short chapter extraction</span>
              </div>
              <div className="memory-card-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{memoryCard.text}</ReactMarkdown>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
