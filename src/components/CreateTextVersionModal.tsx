import CloseIcon from '@/components/CloseIcon';
import type { ChapterTextPrompt } from '@/types/app';

interface CreateTextVersionModalProps {
  open: boolean;
  promptLibrary: ChapterTextPrompt[];
  selectedPromptId: string;
  onSelectedPromptIdChange: (value: string) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
  selectedPromptTemplate: string;
  savePromptToLibrary: boolean;
  onSavePromptToLibraryChange: (value: boolean) => void;
  promptName: string;
  onPromptNameChange: (value: string) => void;
  versionSaving: boolean;
  canCreateVersion: boolean;
  onClose: () => void;
  onCreate: () => void;
}

export default function CreateTextVersionModal({
  open,
  promptLibrary,
  selectedPromptId,
  onSelectedPromptIdChange,
  customPrompt,
  onCustomPromptChange,
  selectedPromptTemplate,
  savePromptToLibrary,
  onSavePromptToLibraryChange,
  promptName,
  onPromptNameChange,
  versionSaving,
  canCreateVersion,
  onClose,
  onCreate
}: CreateTextVersionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide text-version-modal">
        <header className="modal-header">
          <h2 className="modal-title">Create Text Version</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            aria-label="Close version modal"
            title="Close version modal"
            disabled={versionSaving}
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body text-version-modal-body">
          <div className="text-viewer-setting">
            <span className="text-viewer-setting-label">Prompt</span>
            <select
              className="text-viewer-select"
              value={selectedPromptId}
              onChange={(event) => onSelectedPromptIdChange(event.target.value)}
              disabled={versionSaving}
            >
              {promptLibrary.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-viewer-setting text-version-modal-field">
            <span className="text-viewer-setting-label">Custom prompt</span>
            <p className="text-viewer-placeholder-help">
              Available placeholders: <code>{'{{book_title}}'}</code>, <code>{'{{chapter_title}}'}</code>,{' '}
              <code>{'{{chapter_number}}'}</code>, <code>{'{{chapter_text}}'}</code>, <code>{'{{title}}'}</code>
            </p>
            <textarea
              className="modal-textarea text-viewer-prompt-textarea"
              value={customPrompt}
              onChange={(event) => onCustomPromptChange(event.target.value)}
              placeholder={selectedPromptTemplate || 'Write a prompt with placeholders like {{book_title}}'}
              disabled={versionSaving}
            />
            <label className="text-viewer-checkbox">
              <input
                type="checkbox"
                checked={savePromptToLibrary}
                onChange={(event) => onSavePromptToLibraryChange(event.target.checked)}
                disabled={versionSaving}
              />
              <span>Save this prompt to the library</span>
            </label>
          </div>
          {savePromptToLibrary ? (
            <div className="text-viewer-setting text-version-modal-field text-version-modal-field-compact">
              <span className="text-viewer-setting-label">Prompt name</span>
              <input
                className="text-viewer-input"
                value={promptName}
                onChange={(event) => onPromptNameChange(event.target.value)}
                placeholder="Prompt name"
                disabled={versionSaving}
              />
            </div>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={versionSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={onCreate}
            disabled={!canCreateVersion || versionSaving}
          >
            {versionSaving ? 'Creating…' : 'Create Version'}
          </button>
        </footer>
      </div>
    </div>
  );
}
