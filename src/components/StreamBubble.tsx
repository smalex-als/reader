import type { StreamState } from '@/types/app';
import { useStreamUi } from '@/hooks/useStreamUi';

interface StreamBubbleProps {
  streamState: StreamState;
  onTogglePause: () => void;
}

export default function StreamBubble({ streamState, onTogglePause }: StreamBubbleProps) {
  const { isVisible, status, isDisabled, ariaLabel, title } = useStreamUi(streamState);

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      className={`stream-bubble ${
        status === 'paused'
          ? 'stream-bubble-paused'
          : status === 'connecting'
          ? 'stream-bubble-connecting'
          : ''
      }`}
      onClick={onTogglePause}
      disabled={isDisabled}
      aria-label={ariaLabel}
      title={title}
    >
      {status === 'paused' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5v14l11-7-11-7z" />
        </svg>
      ) : status === 'connecting' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 4a8 8 0 1 1-5.7 13.6l1.4-1.4A6 6 0 1 0 12 6v2l3-3-3-3v2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
      )}
    </button>
  );
}
