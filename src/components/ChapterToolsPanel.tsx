import AddIcon from '@/components/AddIcon';
import ChapterAudioTools, { type ChapterAudioToolsProps } from '@/components/ChapterAudioTools';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import TrashIcon from '@/components/TrashIcon';

type ChapterToolsPanelProps = {
  audio: ChapterAudioToolsProps;
  chapter: {
    creating: boolean;
    deleting: boolean;
    number: number | null;
    onCreate: () => void;
    onDelete: () => void;
    visible: boolean;
  };
  settings: {
    open: boolean;
    onToggle: () => void;
  };
  outline: {
    available: boolean;
    open: boolean;
    onToggle: () => void;
  };
  study: {
    creating: boolean;
    disabled: boolean;
    onCreate: () => void;
  };
  versions: {
    canCreate: boolean;
    canDelete: boolean;
    onCreate: () => void;
    onDelete: () => void;
    saving: boolean;
  };
};

export default function ChapterToolsPanel({
  audio,
  chapter,
  outline,
  settings,
  study,
  versions
}: ChapterToolsPanelProps) {
  return (
    <>
      <div className="text-viewer-tools-panel" id="text-viewer-tools">
        <section className="text-viewer-tools-section" aria-label="View tools">
          <h3 className="text-viewer-tools-title">View</h3>
          <div className="text-viewer-tools-body">
            <div className="text-viewer-tools-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={settings.onToggle}
                aria-expanded={settings.open}
                aria-controls="text-viewer-settings"
              >
                {settings.open ? 'Hide settings' : 'Text settings'}
              </button>
              {outline.available ? (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={outline.onToggle}
                  aria-expanded={outline.open}
                  aria-controls="text-viewer-outline"
                >
                  {outline.open ? 'Hide outline' : 'Show outline'}
                </button>
              ) : null}
            </div>
          </div>
        </section>
        {chapter.visible ? (
          <section className="text-viewer-tools-section" aria-label="Chapter tools">
            <h3 className="text-viewer-tools-title">Chapter</h3>
            <div className="text-viewer-tools-body">
              <div className="text-viewer-tools-row">
                <button
                  type="button"
                  className="button button-ghost modal-icon-button"
                  onClick={chapter.onCreate}
                  disabled={chapter.creating}
                  aria-label="Create chapter"
                  title="Create chapter"
                >
                  <AddIcon />
                </button>
                {chapter.number ? (
                  <button
                    type="button"
                    className="button button-ghost modal-icon-button"
                    onClick={chapter.onDelete}
                    disabled={chapter.deleting}
                    aria-label="Delete chapter"
                    title="Delete chapter"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
        <section className="text-viewer-tools-section" aria-label="Version tools">
          <h3 className="text-viewer-tools-title">Versions</h3>
          <div className="text-viewer-tools-body">
            <div className="text-viewer-tools-row">
              <button
                type="button"
                className="button button-ghost modal-icon-button"
                onClick={versions.onCreate}
                disabled={!versions.canCreate || versions.saving}
                aria-label="Create text version"
                title="Create text version"
              >
                <AddIcon />
              </button>
              {versions.canDelete ? (
                <button
                  type="button"
                  className="button button-ghost modal-icon-button"
                  onClick={versions.onDelete}
                  disabled={versions.saving}
                  aria-label="Delete selected version"
                  title="Delete selected version"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          </div>
        </section>
        <ChapterAudioTools {...audio} />
        <section className="text-viewer-tools-section" aria-label="Study tools">
          <h3 className="text-viewer-tools-title">Study</h3>
          <div className="text-viewer-tools-body">
            <div className="text-viewer-tools-row">
              <button
                type="button"
                className="button button-primary"
                onClick={study.onCreate}
                disabled={study.disabled}
              >
                {study.creating ? 'Creating...' : 'Create a unit'}
              </button>
            </div>
          </div>
        </section>
      </div>
      {settings.open ? <TextSettingsPanel id="text-viewer-settings" controlPrefix="text" /> : null}
    </>
  );
}
