import { useEffect, useMemo } from 'react';
import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectModalOpen,
  selectVocabularyWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { StreamState } from '@/types/app';

interface VocabularyModalProps {
  chapterLabel: string;
  streamState: StreamState;
  onCopyList: (text: string) => void;
  onPlayAudio: (text: string, chapterNumber: number) => void;
  onStopAudio: () => void;
  onRegenerate: () => void;
}

export default function VocabularyModal({
  chapterLabel,
  streamState,
  onCopyList,
  onPlayAudio,
  onStopAudio,
  onRegenerate
}: VocabularyModalProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('vocabulary'));
  const {
    loading,
    error,
    vocabulary
  } = useAppSelector(selectVocabularyWorkflow);
  const handleClose = () => {
    dispatch(appActions.closeModal('vocabulary'));
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

  const spokenText = useMemo(() => {
    if (!vocabulary) {
      return '';
    }
    return [
      vocabulary.title,
      ...vocabulary.items.map((item, index) => `${index + 1}. ${item.term}. ${item.definition}`)
    ].join('\n\n');
  }, [vocabulary]);

  const streamPrefix = vocabulary ? `vocabulary::chapter-${vocabulary.chapterNumber}` : null;
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
            Vocabulary
            <span className="modal-marker">• {chapterLabel}</span>
          </h2>
          <div className="modal-actions">
            <button
              type="button"
              className={`button button-secondary modal-icon-button ${isStreaming ? 'button-active' : ''}`}
              onClick={() => {
                if (!vocabulary || !spokenText) {
                  return;
                }
                if (isStreaming) {
                  onStopAudio();
                  return;
                }
                onPlayAudio(spokenText, vocabulary.chapterNumber);
              }}
              disabled={!vocabulary || loading}
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
                if (!spokenText) {
                  return;
                }
                onCopyList(spokenText);
              }}
              disabled={!vocabulary || loading}
              aria-label="Copy list"
              title="Copy list"
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
              aria-label="Generate vocabulary"
              title="Generate vocabulary"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="m14.7 4.3 1 2.3 2.3 1-2.3 1-1 2.3-1-2.3-2.3-1 2.3-1 1-2.3Z"
                  fill="currentColor"
                />
                <path
                  d="m8.4 10.2 5.4 5.4-1.4 1.4-5.4-5.4 1.4-1.4Zm-1.9 3.3 1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1 1-2.2Z"
                  fill="currentColor"
                />
                <path d="m15.8 12.8 2.2 2.2-3 3a1.4 1.4 0 0 1-2 0l-.2-.2 3-3Z" fill="currentColor" />
              </svg>
              <span>Generate</span>
            </button>
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
              aria-label="Close vocabulary"
              title="Close vocabulary"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body">
          {loading ? <p className="modal-status">Generating vocabulary…</p> : null}
          {!loading && error ? <p className="modal-status">{error}</p> : null}
          {!loading && !error && !vocabulary ? <p className="modal-status">No vocabulary available.</p> : null}
          {!loading && !error && vocabulary ? (
            <div className="study-vocabulary">
              <div className="study-vocabulary-header">
                <span className="toolbar-readout">{vocabulary.title}</span>
                <span className="toolbar-readout">{vocabulary.items.length} terms</span>
              </div>
              <div className="study-vocabulary-list">
                {vocabulary.items.map((item, index) => (
                  <div key={item.id} className="study-vocabulary-item">
                    <div className="study-vocabulary-term">
                      <span className="study-vocabulary-index">{index + 1}.</span> {item.term}
                    </div>
                    <div className="study-vocabulary-definition">{item.definition}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
