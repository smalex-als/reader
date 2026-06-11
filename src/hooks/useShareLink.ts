import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/useToast';
import { trackEvent } from '@/lib/analytics';
import { copyToClipboard } from '@/lib/clipboard';

interface UseShareLinkOptions {
  bookId: string | null;
  currentPage: number;
  navigationCount: number;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
}

export function useShareLink(options: UseShareLinkOptions) {
  const { bookId, currentPage, navigationCount, viewMode } = options;
  const { showToast } = useToast();
  const shareOpenedTrackedRef = useRef(false);

  const shareLink = useCallback(async () => {
    if (!bookId || navigationCount === 0) {
      showToast('Select a book before sharing', 'error');
      return;
    }
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('book', bookId);
    shareUrl.searchParams.set('page', String(currentPage + 1));
    shareUrl.searchParams.set('view', viewMode);
    shareUrl.searchParams.set('src', 'share');
    const shareMessage = `Read ${bookId} at page ${currentPage + 1}`;
    try {
      if (navigator?.share) {
        await navigator.share({ title: 'Scanned Book Reader', text: shareMessage, url: shareUrl.toString() });
      } else {
        const copied = await copyToClipboard(shareUrl.toString());
        if (!copied) {
          throw new Error('copy failed');
        }
      }
      trackEvent('share_clicked', {
        book: bookId,
        page: currentPage + 1,
        view: viewMode
      });
      showToast('Share link ready', 'success');
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (aborted) {
        return;
      }
      console.error(error);
      showToast('Unable to share link', 'error');
    }
  }, [bookId, currentPage, navigationCount, showToast, viewMode]);

  useEffect(() => {
    if (shareOpenedTrackedRef.current || !bookId || navigationCount === 0) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('src') !== 'share') {
      return;
    }
    shareOpenedTrackedRef.current = true;
    trackEvent('share_opened', {
      book: bookId,
      page: currentPage + 1,
      view: viewMode,
      source: 'share'
    });
  }, [bookId, currentPage, navigationCount, viewMode]);

  return { shareLink };
}
