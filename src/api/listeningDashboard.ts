import type {
  ListeningDashboardBook,
  ListeningDashboardChapter,
  ListeningDashboardData,
  ListeningDashboardDay,
  ListeningDashboardSession,
  ListeningDashboardSource,
  ListeningDashboardTotals,
  ListeningDashboardUnit
} from '@/types/app';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeTotals(value: unknown): ListeningDashboardTotals {
  const record = isRecord(value) ? value : {};
  return {
    sessions: numberValue(record.sessions),
    totalSeconds: numberValue(record.totalSeconds),
    averageSeconds: numberValue(record.averageSeconds),
    daysActive: numberValue(record.daysActive),
    lastListenedAt: nullableString(record.lastListenedAt)
  };
}

function normalizeDay(value: unknown): ListeningDashboardDay | null {
  if (!isRecord(value)) {
    return null;
  }
  const date = stringValue(value.date);
  if (!date) {
    return null;
  }
  return {
    date,
    sessions: numberValue(value.sessions),
    totalSeconds: numberValue(value.totalSeconds)
  };
}

function normalizeSource(value: unknown): ListeningDashboardSource | null {
  if (!isRecord(value)) {
    return null;
  }
  const sourceType = stringValue(value.sourceType);
  if (!sourceType) {
    return null;
  }
  return {
    sourceType,
    label: stringValue(value.label, sourceType),
    sessions: numberValue(value.sessions),
    totalSeconds: numberValue(value.totalSeconds)
  };
}

function normalizeBook(value: unknown): ListeningDashboardBook | null {
  if (!isRecord(value)) {
    return null;
  }
  const bookId = stringValue(value.bookId);
  if (!bookId) {
    return null;
  }
  return {
    bookId,
    sessions: numberValue(value.sessions),
    totalSeconds: numberValue(value.totalSeconds),
    lastListenedAt: nullableString(value.lastListenedAt)
  };
}

function normalizeChapter(value: unknown): ListeningDashboardChapter | null {
  if (!isRecord(value)) {
    return null;
  }
  const bookId = stringValue(value.bookId);
  if (!bookId) {
    return null;
  }
  return {
    bookId,
    chapterNumber: nullableNumber(value.chapterNumber),
    chapterTitle: nullableString(value.chapterTitle),
    subchapterTitle: nullableString(value.subchapterTitle),
    pageNumber: nullableNumber(value.pageNumber),
    pageKeyEnd: nullableString(value.pageKeyEnd),
    sessions: numberValue(value.sessions),
    totalSeconds: numberValue(value.totalSeconds),
    lastListenedAt: nullableString(value.lastListenedAt)
  };
}

function normalizeUnit(value: unknown): ListeningDashboardUnit | null {
  if (!isRecord(value)) {
    return null;
  }
  const unitSetId = stringValue(value.unitSetId);
  const topicId = stringValue(value.topicId);
  if (!unitSetId || !topicId) {
    return null;
  }
  return {
    unitSetId,
    unitSetTitle: nullableString(value.unitSetTitle),
    topicId,
    topicTitle: nullableString(value.topicTitle),
    sourceBookId: nullableString(value.sourceBookId),
    sourceChapterNumber: nullableNumber(value.sourceChapterNumber),
    sourceChapterTitle: nullableString(value.sourceChapterTitle),
    sessions: numberValue(value.sessions),
    totalSeconds: numberValue(value.totalSeconds),
    lastListenedAt: nullableString(value.lastListenedAt)
  };
}

function normalizeSessionEndReason(value: unknown): ListeningDashboardSession['endReason'] {
  return value === 'completed' ||
    value === 'stopped' ||
    value === 'interrupted' ||
    value === 'error' ||
    value === 'unload'
    ? value
    : 'stopped';
}

function normalizeSession(value: unknown): ListeningDashboardSession | null {
  if (!isRecord(value)) {
    return null;
  }
  const timestamp = stringValue(value.timestamp);
  const bookId = stringValue(value.bookId);
  if (!timestamp || !bookId) {
    return null;
  }
  return {
    timestamp,
    bookId,
    chapterNumber: nullableNumber(value.chapterNumber),
    chapterTitle: nullableString(value.chapterTitle),
    subchapterTitle: nullableString(value.subchapterTitle),
    pageNumber: nullableNumber(value.pageNumber),
    pageKeyStart: nullableString(value.pageKeyStart),
    pageKeyEnd: nullableString(value.pageKeyEnd),
    sourceType: stringValue(value.sourceType, 'book'),
    sourceLabel: stringValue(value.sourceLabel, 'Book'),
    unitSetId: nullableString(value.unitSetId),
    topicId: nullableString(value.topicId),
    unitSetTitle: nullableString(value.unitSetTitle),
    topicTitle: nullableString(value.topicTitle),
    unitSourceBookId: nullableString(value.unitSourceBookId),
    unitSourceChapterNumber: nullableNumber(value.unitSourceChapterNumber),
    unitSourceChapterTitle: nullableString(value.unitSourceChapterTitle),
    listenedSeconds: numberValue(value.listenedSeconds),
    sessionCount: numberValue(value.sessionCount),
    endReason: normalizeSessionEndReason(value.endReason)
  };
}

function normalizeDashboard(value: unknown): ListeningDashboardData {
  const record = isRecord(value) ? value : {};
  return {
    generatedAt: stringValue(record.generatedAt, new Date().toISOString()),
    totals: normalizeTotals(record.totals),
    byDay: arrayValue(record.byDay).map(normalizeDay).filter((entry): entry is ListeningDashboardDay => Boolean(entry)),
    bySource: arrayValue(record.bySource)
      .map(normalizeSource)
      .filter((entry): entry is ListeningDashboardSource => Boolean(entry)),
    topBooks: arrayValue(record.topBooks)
      .map(normalizeBook)
      .filter((entry): entry is ListeningDashboardBook => Boolean(entry)),
    topChapters: arrayValue(record.topChapters)
      .map(normalizeChapter)
      .filter((entry): entry is ListeningDashboardChapter => Boolean(entry)),
    topUnits: arrayValue(record.topUnits)
      .map(normalizeUnit)
      .filter((entry): entry is ListeningDashboardUnit => Boolean(entry)),
    recentSessions: arrayValue(record.recentSessions)
      .map(normalizeSession)
      .filter((entry): entry is ListeningDashboardSession => Boolean(entry))
  };
}

export async function fetchListeningDashboard(): Promise<ListeningDashboardData> {
  const response = await fetch('/api/stream-history/dashboard');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return normalizeDashboard(payload);
}
