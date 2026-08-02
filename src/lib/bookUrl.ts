import type { ViewMode } from '@/lib/appConstants';

export function getChapterVersionFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get('book')?.trim()) {
    return null;
  }
  const versionId = params.get('version')?.trim();
  return versionId || null;
}

export function getChapterVersionFromLocation(): string | null {
  return typeof window === 'undefined' ? null : getChapterVersionFromSearch(window.location.search);
}

export function getBookFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const book = params.get('book')?.trim();
  return book ? book : null;
}

export function getPageFromLocation(expectedBookId: string | null): number | null {
  const params = new URLSearchParams(window.location.search);
  const locationBook = params.get('book')?.trim() || null;
  if (!expectedBookId || locationBook !== expectedBookId) {
    return null;
  }
  const rawPage = params.get('page');
  if (!rawPage) {
    return null;
  }
  const parsed = Number.parseInt(rawPage, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed - 1;
}

export function getViewModeFromLocation(expectedBookId: string | null): ViewMode | null {
  const params = new URLSearchParams(window.location.search);
  const locationBook = params.get('book')?.trim() || null;
  if (!expectedBookId || locationBook !== expectedBookId) {
    return null;
  }
  const rawView = params.get('view');
  if (rawView === 'pages' || rawView === 'scroll' || rawView === 'text' || rawView === 'audio') {
    return rawView;
  }
  return null;
}

export function syncBookLocation({
  bookId,
  currentPage,
  viewMode,
  navigationCount
}: {
  bookId: string | null;
  currentPage: number;
  viewMode: ViewMode;
  navigationCount: number;
}) {
  const params = new URLSearchParams(window.location.search);
  const currentParam = params.get('book');
  const currentPageParam = params.get('page');
  const currentViewParam = params.get('view');
  const shouldSyncPosition = Boolean(bookId) && navigationCount > 0;
  const nextPageParam = shouldSyncPosition ? String(currentPage + 1) : null;
  const nextViewParam = shouldSyncPosition ? viewMode : null;

  if (
    (bookId ?? '') === (currentParam ?? '') &&
    (!shouldSyncPosition || (nextPageParam ?? '') === (currentPageParam ?? '')) &&
    (!shouldSyncPosition || (nextViewParam ?? '') === (currentViewParam ?? ''))
  ) {
    return;
  }
  if (bookId) {
    params.set('book', bookId);
  } else {
    params.delete('book');
  }
  if (nextPageParam) {
    params.set('page', nextPageParam);
  } else if (!bookId) {
    params.delete('page');
  }
  if (nextViewParam) {
    params.set('view', nextViewParam);
  } else if (!bookId) {
    params.delete('view');
  }
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
    window.location.hash
  }`;
  window.history.replaceState(null, '', nextUrl);
}
