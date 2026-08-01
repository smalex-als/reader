import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import {
  CHAPTER_TEXT_VERSION_MODELS,
  type ChapterTextVersionModel
} from '@/types/app';

type GenerateChapterModalProps = {
  chapterTitle: string;
  model: ChapterTextVersionModel;
  onClose: () => void;
  onGenerate: () => void;
  onModelChange: (model: ChapterTextVersionModel) => void;
};

export default function GenerateChapterModal({
  chapterTitle,
  model,
  onClose,
  onGenerate,
  onModelChange
}: GenerateChapterModalProps) {
  return (
    <ModalShell
      ariaLabel="Generate chapter text"
      className="modal-confirmation"
      onClose={onClose}
    >
      <header className="modal-header">
        <h2 className="modal-title">Generate Chapter Text</h2>
        <button
          type="button"
          className="button button-ghost modal-icon-button"
          onClick={onClose}
          aria-label="Close chapter generation modal"
          title="Close chapter generation modal"
        >
          <CloseIcon />
        </button>
      </header>
      <section className="modal-body confirmation-modal-body">
        <p className="confirmation-modal-copy">
          Generate the base text for <strong>{chapterTitle || 'Untitled chapter'}</strong> from its OCR pages.
        </p>
        <label className="text-viewer-setting chapter-generation-model-field">
          <span className="text-viewer-setting-label">Model</span>
          <select
            className="text-viewer-select"
            value={model}
            onChange={(event) => onModelChange(event.target.value as ChapterTextVersionModel)}
          >
            {CHAPTER_TEXT_VERSION_MODELS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </section>
      <footer className="modal-footer confirmation-modal-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button" onClick={onGenerate}>
          Generate Text
        </button>
      </footer>
    </ModalShell>
  );
}
