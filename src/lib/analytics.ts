type AnalyticsValue = string | number | boolean | null;

type TrackPayload = {
  event: string;
  properties?: Record<string, AnalyticsValue>;
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
