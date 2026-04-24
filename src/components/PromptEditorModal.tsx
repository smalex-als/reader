import { useEffect, useMemo, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import type { ChapterTextPrompt } from '@/types/app';

interface PromptEditorModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

type PromptLibraryResponse = {
  prompts?: ChapterTextPrompt[];
  prompt?: ChapterTextPrompt;
};

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function fetchPromptLibrary(init?: RequestInit) {
  const response = await fetch('/api/chapter-text-prompts', init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = (await response.json()) as PromptLibraryResponse;
  return Array.isArray(payload.prompts) ? payload.prompts : [];
}

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

export default function PromptEditorModal({ open, onClose, onChanged }: PromptEditorModalProps) {
  const [prompts, setPrompts] = useState<ChapterTextPrompt[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftTemplate, setDraftTemplate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedId) ?? prompts[0] ?? null,
    [prompts, selectedId]
  );
  const isDirty =
    selectedPrompt !== null &&
    (draftName.trim() !== selectedPrompt.name || draftTemplate.trim() !== selectedPrompt.template);
  const canSave = selectedPrompt !== null && draftName.trim().length > 0 && draftTemplate.trim().length > 0 && isDirty;

  useEffect(() => {
    if (!open) {
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    setStatus(null);
    fetchPromptLibrary()
      .then((nextPrompts) => {
        if (canceled) {
          return;
        }
        setPrompts(nextPrompts);
        setSelectedId((current) =>
          current && nextPrompts.some((prompt) => prompt.id === current)
            ? current
            : nextPrompts[0]?.id ?? ''
        );
      })
      .catch((err) => {
        if (!canceled) {
          setPrompts([]);
          setSelectedId('');
          setError(err instanceof Error ? err.message : 'Unable to load prompts.');
        }
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedPrompt) {
      setDraftName('');
      setDraftTemplate('');
      return;
    }
    setDraftName(selectedPrompt.name);
    setDraftTemplate(selectedPrompt.template);
  }, [selectedPrompt]);

  const updatePrompts = (nextPrompts: ChapterTextPrompt[], nextSelectedId = selectedId) => {
    setPrompts(nextPrompts);
    setSelectedId(
      nextSelectedId && nextPrompts.some((prompt) => prompt.id === nextSelectedId)
        ? nextSelectedId
        : nextPrompts[0]?.id ?? ''
    );
    onChanged?.();
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch('/api/chapter-text-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New article version prompt',
          template: NEW_PROMPT_TEMPLATE
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as PromptLibraryResponse;
      const nextPrompts = Array.isArray(payload.prompts) ? payload.prompts : [];
      updatePrompts(nextPrompts, payload.prompt?.id);
      setStatus('Prompt created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create prompt.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt || !canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/chapter-text-prompts/${encodeURIComponent(selectedPrompt.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          template: draftTemplate
        })
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as PromptLibraryResponse;
      updatePrompts(Array.isArray(payload.prompts) ? payload.prompts : [], selectedPrompt.id);
      setStatus('Prompt saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save prompt.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrompt || selectedPrompt.builtIn) {
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/chapter-text-prompts/${encodeURIComponent(selectedPrompt.id)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as PromptLibraryResponse;
      updatePrompts(Array.isArray(payload.prompts) ? payload.prompts : []);
      setStatus('Prompt deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete prompt.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-wide prompt-editor-modal">
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
            onClick={onClose}
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
                onClick={() => setSelectedId(prompt.id)}
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
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save Prompt'}
          </button>
        </footer>
      </div>
    </div>
  );
}
