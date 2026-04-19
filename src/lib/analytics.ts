type AnalyticsValue = string | number | boolean | null;

type TrackPayload = {
  event: string;
  properties?: Record<string, AnalyticsValue>;
};

type StreamHistoryPayload = {
  bookId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  subchapterTitle?: string | null;
  pageKeyStart: string | null;
  pageKeyEnd: string | null;
  startedAt: string;
  endedAt: string;
  listenedSeconds: number;
  endReason: 'completed' | 'stopped' | 'interrupted' | 'error' | 'unload';
};

function postWithBeacon(payload: TrackPayload): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return false;
  }
  try {
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon('/api/events', body);
  } catch {
    return false;
  }
}

export function trackEvent(event: string, properties?: Record<string, AnalyticsValue>) {
  const payload: TrackPayload = { event, properties };
  if (postWithBeacon(payload)) {
    return;
  }
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
}

export function logStreamHistory(payload: StreamHistoryPayload) {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      if (navigator.sendBeacon('/api/stream-history', body)) {
        return;
      }
    } catch {
      // ignore beacon errors and fall back to fetch
    }
  }
  void fetch('/api/stream-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
}
