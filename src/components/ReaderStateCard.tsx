type ReaderStateTone = 'empty' | 'error' | 'loading';

type ReaderStateAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

type ReaderStateCardProps = {
  title: string;
  description?: string;
  tone?: ReaderStateTone;
  action?: ReaderStateAction;
  secondaryAction?: ReaderStateAction;
  compact?: boolean;
};

const TONE_LABELS: Record<ReaderStateTone, string> = {
  empty: 'Nothing here yet',
  error: 'Something went wrong',
  loading: 'Loading'
};

export default function ReaderStateCard({
  title,
  description,
  tone = 'empty',
  action,
  secondaryAction,
  compact = false
}: ReaderStateCardProps) {
  return (
    <section
      className={`reader-state-card ${compact ? 'reader-state-card-compact' : ''}`}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'loading' ? 'polite' : undefined}
    >
      <div className="reader-state-marker" aria-hidden="true">
        {tone === 'loading' ? <span className="reader-state-spinner" /> : tone === 'error' ? '!' : '○'}
      </div>
      <div className="reader-state-copy">
        <span className="reader-state-kicker">{TONE_LABELS[tone]}</span>
        <h3 className="reader-state-title">{title}</h3>
        {description ? <p className="reader-state-description">{description}</p> : null}
      </div>
      {action || secondaryAction ? (
        <div className="reader-state-actions">
          {action ? (
            <button
              type="button"
              className="button reader-state-primary-action"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
