import { useMemo } from 'react';
import type { StreamState } from '@/types/app';

const STREAM_STATUSES = new Set<StreamState['status']>(['connecting', 'paused', 'streaming']);

export function useStreamUi(streamState: StreamState) {
  return useMemo(() => {
    const { status } = streamState;
    const isVisible = STREAM_STATUSES.has(status);
    const isDisabled = status === 'connecting';

    const ariaLabel =
      status === 'paused'
        ? 'Resume stream audio'
        : status === 'connecting'
        ? 'Connecting stream audio'
        : 'Pause stream audio';
    const title =
      status === 'paused'
        ? 'Resume stream'
        : status === 'connecting'
        ? 'Connecting stream'
        : 'Pause stream';

    return { isVisible, status, isDisabled, ariaLabel, title };
  }, [streamState]);
}
