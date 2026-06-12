import {
  sendStreamHistory,
  sendTrackEvent,
  type AnalyticsValue,
  type StreamHistoryPayload
} from '@/api/analytics';

export type { AnalyticsValue, StreamHistoryPayload };

export function trackEvent(event: string, properties?: Record<string, AnalyticsValue>) {
  sendTrackEvent({ event, properties });
}

export function logStreamHistory(payload: StreamHistoryPayload) {
  sendStreamHistory(payload);
}
