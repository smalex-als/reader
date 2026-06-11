import { useEffect, useMemo, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import { usePageText } from '@/hooks/usePageText';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import {
  appActions,
  selectBookSessionWorkflow,
  selectModalOpen,
  selectPageTextWorkflow,
  selectReaderPreferences,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function TextModal() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const open = useAppSelector(selectModalOpen('text'));
  const { currentPage } = useAppSelector(selectReaderSession);
  const { manifest } = useAppSelector(selectBookSessionWorkflow);
  const {
    cache: textCache,
    loading,
    saving,
    regenerated
  } = useAppSelector(selectPageTextWorkflow);
  const { pageTextOcrEngine: ocrEngine } = useAppSelector(selectReaderPreferences);
  const currentImage = manifest[currentPage] ?? null;
  const { fetchPageText, savePageText } = usePageText(currentImage);
  const title = currentImage ?? 'Page text';
  const text = currentImage ? textCache[currentImage] ?? null : null;
  const [draftText, setDraftText] = useState('');
  const [copied, setCopied] = useState(false);
  const generatedMarker = text?.source === 'ai' || regenerated;
  const handleClose = () => {
    dispatch(appActions.closeModal('text'));
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftText(text?.text ?? '');
  }, [open, text?.text]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const displayedText = useMemo(() => {
    if (!text) {
      return '';
    }
    return text.text || '';
  }, [text]);
  const isDirty = draftText !== displayedText;
  const canCopy = Boolean(draftText.trim());
  const handleCopy = async () => {
    const copied = await copyToClipboard(draftText.trim());
    showToast(copied ? 'Copied page text to clipboard' : 'Unable to copy text', copied ? 'success' : 'error');
    setCopied(true);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide">
        <header className="modal-header">
          <h2 className="modal-title">
            {title}
            {generatedMarker ? <span className="modal-marker">• Generated</span> : null}
          </h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close text"
            title="Close text"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body modal-body-text">
          <div className="modal-toolbar">
            <div className="segmented" role="radiogroup" aria-label="OCR engine">
              <button
                type="button"
                className={`segmented-item ${ocrEngine === 'deepseek_ocr' ? 'segmented-item-active' : ''}`}
                onClick={() => dispatch(appActions.setPageTextOcrEngine('deepseek_ocr'))}
                aria-pressed={ocrEngine === 'deepseek_ocr'}
                disabled={loading || saving}
              >
                Deepseek OCR
              </button>
              <button
                type="button"
                className={`segmented-item ${ocrEngine === 'openai' ? 'segmented-item-active' : ''}`}
                onClick={() => dispatch(appActions.setPageTextOcrEngine('openai'))}
                aria-pressed={ocrEngine === 'openai'}
                disabled={loading || saving}
              >
                OpenAI
              </button>
            </div>
          </div>
          {loading && <p className="modal-status">Loading page text…</p>}
          {!loading && !text && <p className="modal-status">No text available.</p>}
          {!loading && text ? (
            <>
              <textarea
                className="modal-textarea"
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
                disabled={saving}
              />
            </>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button
            type="button"
            className={`button button-secondary ${copied ? 'button-active' : ''}`}
            onClick={() => void handleCopy()}
            disabled={loading || saving || !canCopy}
          >
            {copied ? 'Copied' : 'Copy Text'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              dispatch(appActions.setRegeneratedPageText(true));
              void fetchPageText({ force: true, engine: ocrEngine });
            }}
            disabled={loading || saving}
          >
            Regenerate
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void savePageText(draftText)}
            disabled={loading || saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
