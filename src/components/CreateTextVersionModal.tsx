import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectTextVersionModalWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function CreateTextVersionModal() {
  const dispatch = useAppDispatch();
  const {
    open,
    versions,
    promptLibrary,
    sourceVersionId,
    versionModel,
    selectedPromptId,
    customPrompt,
    savePromptToLibrary,
    promptName,
    versionSaving,
    canCreateVersion
  } = useAppSelector(selectTextVersionModalWorkflow);
  const selectedPromptTemplate =
    customPrompt || promptLibrary.find((prompt) => prompt.id === selectedPromptId)?.template || '';

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
            onClick={() => dispatch(appActions.closeTextVersionModal())}
            aria-label="Close version modal"
            title="Close version modal"
            disabled={versionSaving}
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body text-version-modal-body">
          <div className="text-version-modal-controls">
            <label className="text-viewer-setting text-version-modal-control">
              <span className="text-viewer-setting-label">Create from</span>
              <select
                className="text-viewer-select"
                value={sourceVersionId}
                onChange={(event) => dispatch(appActions.setTextVersionModalSourceVersionId(event.target.value))}
                disabled={versionSaving}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label}
                    {version.promptName ? ` · ${version.promptName}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-viewer-setting text-version-modal-control">
              <span className="text-viewer-setting-label">Prompt</span>
              <select
                className="text-viewer-select"
                value={selectedPromptId}
                onChange={(event) => dispatch(appActions.setTextVersionModalSelectedPromptId(event.target.value))}
                disabled={versionSaving}
              >
                {promptLibrary.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-viewer-setting text-version-modal-control">
              <span className="text-viewer-setting-label">Model</span>
              <select
                className="text-viewer-select"
                value={versionModel}
                onChange={(event) => dispatch(appActions.setTextVersionModalVersionModel(event.target.value))}
                disabled={versionSaving}
              >
                <option value="gpt-5.5">gpt-5.5</option>
                <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                <option value="gpt-5.4-nano">gpt-5.4-nano</option>
              </select>
            </label>
          </div>
          <div className="text-viewer-setting text-version-modal-field">
            <span className="text-viewer-setting-label">Custom prompt</span>
            <p className="text-viewer-placeholder-help">
              Available placeholders: <code>{'{{book_title}}'}</code>, <code>{'{{chapter_title}}'}</code>,{' '}
              <code>{'{{chapter_number}}'}</code>, <code>{'{{chapter_text}}'}</code>, <code>{'{{title}}'}</code>.
              If none are used, book/chapter context and source text are appended automatically.
            </p>
            <textarea
              className="modal-textarea text-viewer-prompt-textarea"
              value={customPrompt}
              onChange={(event) => dispatch(appActions.setTextVersionModalCustomPrompt(event.target.value))}
              placeholder={selectedPromptTemplate || 'Write a prompt with placeholders like {{book_title}}'}
              disabled={versionSaving}
            />
            <label className="text-viewer-checkbox">
              <input
                type="checkbox"
                checked={savePromptToLibrary}
                onChange={(event) => dispatch(appActions.setTextVersionModalSavePromptToLibrary(event.target.checked))}
                disabled={versionSaving}
              />
              <span>Save this prompt to the library</span>
            </label>
          </div>
          {savePromptToLibrary ? (
            <label className="text-viewer-setting text-version-modal-field text-version-modal-field-compact">
              <span className="text-viewer-setting-label">Prompt name</span>
              <input
                className="text-viewer-input"
                value={promptName}
                onChange={(event) => dispatch(appActions.setTextVersionModalPromptName(event.target.value))}
                placeholder="Prompt name"
                disabled={versionSaving}
              />
            </label>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => dispatch(appActions.closeTextVersionModal())}
            disabled={versionSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button"
            onClick={() => dispatch(appActions.requestTextVersionCreate())}
            disabled={!canCreateVersion || versionSaving}
          >
            {versionSaving ? 'Creating…' : 'Create Version'}
          </button>
        </footer>
      </div>
    </div>
  );
}
