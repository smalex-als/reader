import { useEffect, useMemo, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import type { PageText, PageTextOcrEngine } from '@/types/app';

interface TextModalProps {
  open: boolean;
  text: PageText | null;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  title: string;
  ocrEngine: PageTextOcrEngine;
  onOcrEngineChange: (engine: PageTextOcrEngine) => void;
  onRegenerate: (engine: PageTextOcrEngine) => void;
  regenerated: boolean;
  onSave: (nextText: string) => void;
  onCopyText: (textValue: string) => void;
}

export default function TextModal({
  open,
  text,
  loading,
  saving,
  onClose,
  title,
  ocrEngine,
  onOcrEngineChange,
  onRegenerate,
  regenerated,
  onSave,
  onCopyText
}: TextModalProps) {
  const [draftText, setDraftText] = useState('');
  const [copied, setCopied] = useState(false);
  const generatedMarker = text?.source === 'ai' || regenerated;

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
            onClick={onClose}
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
                onClick={() => onOcrEngineChange('deepseek_ocr')}
                aria-pressed={ocrEngine === 'deepseek_ocr'}
                disabled={loading || saving}
              >
                Deepseek OCR
              </button>
              <button
                type="button"
                className={`segmented-item ${ocrEngine === 'openai' ? 'segmented-item-active' : ''}`}
                onClick={() => onOcrEngineChange('openai')}
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
            onClick={() => {
              onCopyText(draftText);
              setCopied(true);
            }}
            disabled={loading || saving || !canCopy}
          >
            {copied ? 'Copied' : 'Copy Text'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onRegenerate(ocrEngine)}
            disabled={loading || saving}
          >
            Regenerate
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onSave(draftText)}
            disabled={loading || saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
