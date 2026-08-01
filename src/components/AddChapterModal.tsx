import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import type { CreateChapterSource } from '@/api/bookSession';
import type { YouTubeTranscriptionModel } from '@/api/youtubeAudioImport';
import { fetchPromptLibrary } from '@/api/chapterTextPrompts';
import type { ChapterTextPrompt } from '@/types/app';

type AddChapterModalProps = {
  busy: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: (details: {
    chapterTitle: string;
    source: CreateChapterSource;
    sourceUrl: string;
    transcriptionModel: YouTubeTranscriptionModel;
    postProcessPromptId: string;
  }) => Promise<void>;
};

export default function AddChapterModal({
  busy,
  open,
  onClose,
  onSubmit
}: AddChapterModalProps) {
  const titleId = useId();
  const blankTabId = useId();
  const youtubeTabId = useId();
  const blankPanelId = useId();
  const youtubePanelId = useId();
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const youtubeTabRef = useRef<HTMLButtonElement>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [source, setSource] = useState<CreateChapterSource>('blank');
  const [sourceUrl, setSourceUrl] = useState('');
  const [transcriptionModel, setTranscriptionModel] = useState<YouTubeTranscriptionModel>('nemotron-asr');
  const [postProcessPromptId, setPostProcessPromptId] = useState('');
  const [prompts, setPrompts] = useState<ChapterTextPrompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsError, setPromptsError] = useState<string | null>(null);
  const selectedPrompt = prompts.find((prompt) => prompt.id === postProcessPromptId) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    setChapterTitle('');
    setSource('blank');
    setSourceUrl('');
    setTranscriptionModel('nemotron-asr');
    setPostProcessPromptId('');
    setPrompts([]);
    setPromptsLoading(true);
    setPromptsError(null);
    let canceled = false;
    void fetchPromptLibrary()
      .then((result) => {
        if (!canceled) {
          setPrompts(result.prompts);
        }
      })
      .catch((error) => {
        if (!canceled) {
          setPrompts([]);
          setPromptsError(error instanceof Error ? error.message : 'Unable to load prompts');
        }
      })
      .finally(() => {
        if (!canceled) {
          setPromptsLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (source === 'youtube' && !sourceUrl.trim()) {
      return;
    }
    await onSubmit({
      chapterTitle: source === 'youtube' ? '' : chapterTitle,
      source,
      sourceUrl,
      transcriptionModel,
      postProcessPromptId: source === 'youtube' ? postProcessPromptId : ''
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const nextSource = event.key === 'ArrowLeft' || event.key === 'Home' ? 'blank' : 'youtube';
    setSource(nextSource);
    (nextSource === 'blank' ? initialFocusRef : youtubeTabRef).current?.focus();
  };

  return (
    <ModalShell
      ariaLabelledBy={titleId}
      className="add-chapter-modal"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      initialFocusRef={initialFocusRef}
      onClose={onClose}
    >
      <form onSubmit={(event) => void handleSubmit(event)}>
        <header className="modal-header">
          <div className="add-chapter-modal-heading">
            <h2 id={titleId} className="modal-title">Add Chapter</h2>
            <p>Create an empty chapter or turn a YouTube video into readable text.</p>
          </div>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close add chapter"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body add-chapter-modal-body">
          <div className="add-chapter-source-tabs segmented" role="tablist" aria-label="Chapter source">
            <button
              ref={initialFocusRef}
              type="button"
              id={blankTabId}
              role="tab"
              aria-selected={source === 'blank'}
              aria-controls={blankPanelId}
              tabIndex={source === 'blank' ? 0 : -1}
              className={`segmented-item ${source === 'blank' ? 'segmented-item-active' : ''}`}
              onClick={() => setSource('blank')}
              onKeyDown={handleTabKeyDown}
              disabled={busy}
            >
              <span>Blank Chapter</span>
              <small>Start writing from scratch</small>
            </button>
            <button
              ref={youtubeTabRef}
              type="button"
              id={youtubeTabId}
              role="tab"
              aria-selected={source === 'youtube'}
              aria-controls={youtubePanelId}
              tabIndex={source === 'youtube' ? 0 : -1}
              className={`segmented-item ${source === 'youtube' ? 'segmented-item-active' : ''}`}
              onClick={() => setSource('youtube')}
              onKeyDown={handleTabKeyDown}
              disabled={busy}
            >
              <span>YouTube Audio</span>
              <small>Download and transcribe</small>
            </button>
          </div>
          {source === 'blank' ? (
            <div
              id={blankPanelId}
              role="tabpanel"
              aria-labelledby={blankTabId}
              className="add-chapter-source-panel"
            >
              <label className="text-viewer-setting add-chapter-modal-field">
                <span className="text-viewer-setting-label">Chapter title</span>
                <input
                  className="text-viewer-input"
                  value={chapterTitle}
                  onChange={(event) => setChapterTitle(event.target.value)}
                  placeholder="Optional"
                  disabled={busy}
                />
              </label>
            </div>
          ) : null}
          {source === 'youtube' ? (
            <div
              id={youtubePanelId}
              role="tabpanel"
              aria-labelledby={youtubeTabId}
              className="add-chapter-source-panel"
            >
              <div className="add-chapter-workflow" aria-label="YouTube import workflow">
                <div className="add-chapter-workflow-step">
                  <span>1</span>
                  <div><strong>Download</strong><small>YouTube audio to MP3</small></div>
                </div>
                <div className="add-chapter-workflow-arrow" aria-hidden="true">→</div>
                <div className="add-chapter-workflow-step">
                  <span>2</span>
                  <div>
                    <strong>Transcribe</strong>
                    <small>{transcriptionModel === 'gpt-transcribe' ? 'OpenAI gpt-transcribe' : 'Nemotron ASR'}</small>
                  </div>
                </div>
                <div className="add-chapter-workflow-arrow" aria-hidden="true">→</div>
                <div className="add-chapter-workflow-step">
                  <span>3</span>
                  <div>
                    <strong>{selectedPrompt ? 'Create version' : 'Save base'}</strong>
                    <small>
                      {selectedPrompt
                        ? `${selectedPrompt.name} · ${selectedPrompt.model}`
                        : 'Keep the raw transcript'}
                    </small>
                  </div>
                </div>
              </div>
              <label className="text-viewer-setting add-chapter-modal-field">
                <span className="text-viewer-setting-label">YouTube URL</span>
                <input
                  type="url"
                  className="text-viewer-input"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                  required
                  disabled={busy}
                />
                <span className="text-viewer-placeholder-help">
                  The video title becomes the chapter title. Download and speech-to-text continue in the background.
                </span>
              </label>
              <label className="text-viewer-setting add-chapter-modal-field">
                <span className="text-viewer-setting-label">Speech-to-text model</span>
                <select
                  className="text-viewer-select"
                  value={transcriptionModel}
                  onChange={(event) => setTranscriptionModel(event.target.value as YouTubeTranscriptionModel)}
                  disabled={busy}
                >
                  <option value="nemotron-asr">Nemotron ASR</option>
                  <option value="gpt-transcribe">OpenAI gpt-transcribe</option>
                </select>
                <span className="text-viewer-placeholder-help">
                  {transcriptionModel === 'gpt-transcribe'
                    ? 'Uses OPENAI_API_KEY. Long recordings are split into upload-sized audio chunks.'
                    : 'Uses the configured local Nemotron ASR service.'}
                </span>
              </label>
              <label className="text-viewer-setting add-chapter-modal-field">
                <span className="text-viewer-setting-label">After speech-to-text</span>
                <select
                  className="text-viewer-select"
                  value={postProcessPromptId}
                  onChange={(event) => setPostProcessPromptId(event.target.value)}
                  disabled={busy || promptsLoading}
                >
                  <option value="">No post-processing</option>
                  {prompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>{prompt.name} · {prompt.model}</option>
                  ))}
                </select>
                <span className="text-viewer-placeholder-help">
                  {promptsLoading
                    ? 'Loading prompts…'
                    : promptsError
                      ? `Prompts unavailable: ${promptsError}`
                      : postProcessPromptId
                        ? 'A new text version will be created and opened automatically when processing finishes.'
                        : `The ${transcriptionModel === 'gpt-transcribe' ? 'OpenAI' : 'Nemotron'} transcript will remain the base version.`}
                </span>
              </label>
            </div>
          ) : null}
        </section>
        <footer className="modal-footer modal-footer-right">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="button"
            disabled={busy || (source === 'youtube' && !sourceUrl.trim())}
          >
            {busy
              ? source === 'youtube' ? 'Starting import…' : 'Creating…'
              : source === 'youtube' ? 'Import YouTube' : 'Add Chapter'}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
