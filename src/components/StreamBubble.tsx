import { useEffect, useState } from 'react';
import type { StreamState } from '@/types/app';
import { useStreamUi } from '@/hooks/useStreamUi';

type StreamVoiceOption = {
  id: string;
  label: string;
};

interface StreamBubbleProps {
  streamState: StreamState;
  streamVoice: string;
  streamVoiceOptions: readonly StreamVoiceOption[];
  onStreamVoiceChange: (voice: string) => void;
  showAutoFollow?: boolean;
  autoFollowEnabled?: boolean;
  onToggleAutoFollow?: () => void;
  studyMode?: boolean;
  onToggleStudyMode?: () => void;
  onTogglePause: () => void;
  onStopStream: () => void;
}

export default function StreamBubble({
  streamState,
  streamVoice,
  streamVoiceOptions,
  onStreamVoiceChange,
  showAutoFollow = false,
  autoFollowEnabled = false,
  onToggleAutoFollow,
  studyMode = false,
  onToggleStudyMode,
  onTogglePause,
  onStopStream
}: StreamBubbleProps) {
  const { isVisible, status, isDisabled, ariaLabel, title } = useStreamUi(streamState);
  const [renderVisible, setRenderVisible] = useState(isVisible);
  const [displayStatus, setDisplayStatus] = useState(status);
  const playedSeconds = Math.max(0, Math.floor(streamState.playbackSeconds));
  const minutes = Math.floor(playedSeconds / 60);
  const seconds = playedSeconds % 60;
  const timeLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;

  useEffect(() => {
    if (isVisible) {
      setDisplayStatus((current) => (status === 'connecting' && current === 'paused' ? current : status));
      setRenderVisible(true);
      return;
    }
    setDisplayStatus('paused');
    const timeout = window.setTimeout(() => setRenderVisible(false), 450);
    return () => window.clearTimeout(timeout);
  }, [isVisible, status]);

  if (!renderVisible) {
    return null;
  }

  return (
    <div
      className={`stream-bubble ${
        displayStatus === 'connecting'
          ? 'stream-bubble-connecting'
          : ''
      }`}
    >
      <button
        type="button"
        className="stream-bubble-main"
        onClick={onTogglePause}
        disabled={isDisabled}
        aria-label={ariaLabel}
        title={title}
      >
        {displayStatus === 'paused' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5v14l11-7-11-7z" />
          </svg>
        ) : displayStatus === 'connecting' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 4a8 8 0 1 1-5.7 13.6l1.4-1.4A6 6 0 1 0 12 6v2l3-3-3-3v2z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        )}
      </button>
      <span className="stream-bubble-time" aria-live="polite">
        {timeLabel}
      </span>
      <span className="stream-bubble-divider" aria-hidden="true" />
      <label className="stream-bubble-voice-label">
        <select
          className="select stream-bubble-voice-select"
          value={streamVoice}
          onChange={(event) => onStreamVoiceChange(event.target.value)}
          aria-label="Streaming voice"
          title="Streaming voice"
        >
          {streamVoiceOptions.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
            </option>
          ))}
        </select>
      </label>
      {showAutoFollow ? (
        <>
          <span className="stream-bubble-divider" aria-hidden="true" />
          <button
            type="button"
            className={`stream-bubble-toggle ${autoFollowEnabled ? 'stream-bubble-toggle-active' : ''}`}
            onClick={onToggleAutoFollow}
            aria-pressed={autoFollowEnabled}
            title={autoFollowEnabled ? 'Disable auto-follow' : 'Enable auto-follow'}
          >
            Follow
          </button>
        </>
      ) : null}
      <span className="stream-bubble-divider" aria-hidden="true" />
      <label className="stream-bubble-checkbox">
        <input
          type="checkbox"
          checked={studyMode}
          onChange={onToggleStudyMode}
          aria-label="Study mode"
        />
        <span>Study</span>
      </label>
      <span className="stream-bubble-divider" aria-hidden="true" />
      <button
        type="button"
        className="stream-bubble-stop"
        onClick={onStopStream}
        aria-label="Stop stream audio"
        title="Stop stream"
      >
        <svg
          className="stream-bubble-stop-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M7 7l10 10M17 7l-10 10" />
        </svg>
      </button>
    </div>
  );
}
