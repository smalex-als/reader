import { useEffect, useMemo, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import { usePromptEditorActions } from '@/hooks/usePromptEditorActions';
import {
  appActions,
  selectModalOpen,
  selectPromptEditorWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

const NEW_PROMPT_TEMPLATE = `Rewrite the chapter into a clean article version.

Book: {{book_title}}
Chapter: {{chapter_title}}

Rules:
- preserve the core ideas and technical details
- remove OCR noise, repeated phrasing, and filler
- keep the author's meaning
- improve structure, headings, and readability
- return only the rewritten article text

Source:
{{chapter_text}}`;

export default function PromptEditorModal() {
  const dispatch = useAppDispatch();
  const {
    loadPrompts,
    createPrompt,
    savePrompt,
    deletePrompt,
    selectPrompt
  } = usePromptEditorActions();
  const open = useAppSelector(selectModalOpen('promptEditor'));
  const { prompts, selectedId, loading, saving, error, status } = useAppSelector(selectPromptEditorWorkflow);
  const [draftName, setDraftName] = useState('');
  const [draftTemplate, setDraftTemplate] = useState('');

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedId) ?? prompts[0] ?? null,
    [prompts, selectedId]
  );
  const isDirty =
    selectedPrompt !== null &&
    (draftName.trim() !== selectedPrompt.name || draftTemplate.trim() !== selectedPrompt.template);
  const canSave = selectedPrompt !== null && draftName.trim().length > 0 && draftTemplate.trim().length > 0 && isDirty;
  const handleClose = () => {
    dispatch(appActions.closeModal('promptEditor'));
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadPrompts();
  }, [loadPrompts, open]);

  useEffect(() => {
    if (!selectedPrompt) {
      setDraftName('');
      setDraftTemplate('');
      return;
    }
    setDraftName(selectedPrompt.name);
    setDraftTemplate(selectedPrompt.template);
  }, [selectedPrompt]);

  const handleCreate = () => {
    void createPrompt({
      name: 'New article version prompt',
      template: NEW_PROMPT_TEMPLATE
    });
  };

  const handleSave = () => {
    if (!selectedPrompt || !canSave) {
      return;
    }
    void savePrompt(selectedPrompt.id, {
      name: draftName,
      template: draftTemplate
    });
  };

  const handleDelete = () => {
    if (!selectedPrompt || selectedPrompt.builtIn) {
      return;
    }
    void deletePrompt(selectedPrompt.id);
  };

  if (!open) {
    return null;
  }

  return (
    <ModalShell
      ariaLabel="Version prompts"
      onClose={handleClose}
      className="modal-wide prompt-editor-modal"
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
    >
        <header className="modal-header">
          <div>
            <h2 className="modal-title">Version Prompts</h2>
            <p className="prompt-editor-subtitle">
              These prompts are used when creating article/text versions. Available placeholders:{' '}
              <code>{'{{book_title}}'}</code>, <code>{'{{chapter_title}}'}</code>,{' '}
              <code>{'{{chapter_number}}'}</code>, <code>{'{{chapter_text}}'}</code>, <code>{'{{title}}'}</code>.
              If a prompt has none, source context is appended automatically before GPT receives it.
            </p>
          </div>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close prompt editor"
            title="Close prompt editor"
            disabled={saving}
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body prompt-editor-body">
          <aside className="prompt-editor-list" aria-label="Prompt list">
            <button type="button" className="button" onClick={handleCreate} disabled={loading || saving}>
              New Prompt
            </button>
            {loading ? <p className="prompt-editor-note">Loading prompts…</p> : null}
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className={`prompt-editor-list-item ${prompt.id === selectedPrompt?.id ? 'prompt-editor-list-item-active' : ''}`}
                onClick={() => selectPrompt(prompt.id)}
                disabled={saving}
              >
                <span>{prompt.name}</span>
                {prompt.builtIn ? <small>built-in</small> : null}
              </button>
            ))}
          </aside>
          <div className="prompt-editor-form">
            {selectedPrompt ? (
              <>
                <label className="text-viewer-setting text-version-modal-field text-version-modal-field-compact">
                  <span className="text-viewer-setting-label">Name</span>
                  <input
                    className="text-viewer-input"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    disabled={saving}
                  />
                </label>
                <label className="text-viewer-setting text-version-modal-field">
                  <span className="text-viewer-setting-label">Prompt</span>
                  <textarea
                    className="modal-textarea text-viewer-prompt-textarea prompt-editor-textarea"
                    value={draftTemplate}
                    onChange={(event) => setDraftTemplate(event.target.value)}
                    disabled={saving}
                  />
                </label>
              </>
            ) : (
              <p className="prompt-editor-note">No prompts found.</p>
            )}
          </div>
        </section>
        {(error || status) ? (
          <div className={`prompt-editor-message ${error ? 'prompt-editor-message-error' : ''}`} role="status">
            {error || status}
          </div>
        ) : null}
        <footer className="modal-footer modal-footer-right">
          <button
            type="button"
            className="button button-secondary"
            onClick={handleDelete}
            disabled={!selectedPrompt || selectedPrompt.builtIn || saving}
          >
            Delete
          </button>
          <button type="button" className="button button-secondary" onClick={handleClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save Prompt'}
          </button>
        </footer>
    </ModalShell>
  );
}
