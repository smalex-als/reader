import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import { useChapterMemoryCard } from '@/hooks/useChapterMemoryCard';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkListItemBreaks } from '@/lib/remarkListItemBreaks';
import {
  appActions,
  selectMemoryCardWorkflow,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useStreamActivity } from '@/state/streamRuntimeStore';

export default function MemoryCardModal() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const open = useAppSelector(selectModalOpen('memoryCard'));
  const streamState = useStreamActivity();
  const {
    loading,
    error,
    memoryCard
  } = useAppSelector(selectMemoryCardWorkflow);
  const {
    chapterNumber,
    chapterLabel
  } = useCurrentChapterContext();
  const { regenerateMemoryCard } = useChapterMemoryCard();
  const handleClose = () => {
    dispatch(appActions.requestStopStream());
    dispatch(appActions.closeModal('memoryCard'));
  };
  const handleCopyText = async () => {
    const trimmed = memoryCard?.text.trim() ?? '';
    if (!trimmed) {
      showToast('No memory card available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(trimmed);
    showToast(copied ? 'Copied memory card to clipboard' : 'Unable to copy memory card', copied ? 'success' : 'error');
  };

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
    <ModalShell ariaLabel="Memory card" onClose={handleClose} className="modal-memory-card">
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
                  dispatch(appActions.requestStopStream());
                  return;
                }
                dispatch(appActions.requestPlayStudyAudioSingle({
                  text: memoryCard.text,
                  pageKey: `memory-card::chapter-${memoryCard.chapterNumber}`
                }));
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
              onClick={() => void handleCopyText()}
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
              onClick={() => void regenerateMemoryCard()}
              disabled={loading}
            >
              Regenerate
            </button>
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkListItemBreaks]}>
                  {memoryCard.text}
                </ReactMarkdown>
              </div>
            </div>
          ) : null}
        </section>
    </ModalShell>
  );
}
