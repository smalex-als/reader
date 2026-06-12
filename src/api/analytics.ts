export type AnalyticsValue = string | number | boolean | null;

export type TrackPayload = {
  event: string;
  properties?: Record<string, AnalyticsValue>;
};

export type StreamHistoryPayload = {
  bookId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  subchapterTitle?: string | null;
  pageNumber?: number | null;
  pageKeyStart: string | null;
  pageKeyEnd: string | null;
  startedAt: string;
  endedAt: string;
  listenedSeconds: number;
  endReason: 'completed' | 'stopped' | 'interrupted' | 'error' | 'unload';
};

function sendBeacon(path: string, payload: unknown) {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }
  try {
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(path, body);
  } catch {
    return false;
  }
}

function postKeepalive(path: string, payload: unknown) {
  void fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
}

export function sendTrackEvent(payload: TrackPayload) {
  if (sendBeacon('/api/events', payload)) {
    return;
  }
  postKeepalive('/api/events', payload);
}

export function sendStreamHistory(payload: StreamHistoryPayload) {
  if (sendBeacon('/api/stream-history', payload)) {
    return;
  }
  postKeepalive('/api/stream-history', payload);
}
