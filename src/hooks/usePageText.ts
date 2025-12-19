import { useCallback, useMemo, useState } from 'react';
import type { PageInsights, PageText } from '@/types/app';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function usePageText(
  currentImage: string | null,
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textCache, setTextCache] = useState<Record<string, PageText>>({});
  const [insightsCache, setInsightsCache] = useState<Record<string, PageInsights>>({});
  const [textLoading, setTextLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [regeneratedText, setRegeneratedText] = useState(false);

  const fetchPageText = useCallback(
    async (force = false): Promise<PageText | null> => {
      if (!currentImage) {
        return null;
      }
      const cached = textCache[currentImage];
      if (cached && !force) {
        return cached;
      }

      setTextLoading(true);
      try {
        const params = new URLSearchParams({ image: currentImage });
        if (force) {
          params.set('skipCache', '1');
        }
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string; narrationText?: string }>(
          `/api/page-text?${params.toString()}`
        );
        const entry: PageText = {
          text: data.text,
          narrationText: data.narrationText ?? '',
          source: data.source
        };
        setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
        setRegeneratedText(data.source === 'ai' || force);
        showToast(`Page text ${data.source === 'ai' ? 'generated' : 'loaded'}`, 'success');
        return entry;
      } catch (error) {
        console.error(error);
        showToast('Unable to load page text', 'error');
        return null;
      } finally {
        setTextLoading(false);
      }
    },
    [currentImage, showToast, textCache]
  );

  const fetchPageInsights = useCallback(
    async (force = false): Promise<PageInsights | null> => {
      if (!currentImage) {
        return null;
      }
      const cached = insightsCache[currentImage];
      if (cached && !force) {
        return cached;
      }

      setInsightsLoading(true);
      try {
        const params = new URLSearchParams({ image: currentImage });
        if (force) {
          params.set('skipCache', '1');
        }
        const data = await fetchJson<{
          source: 'file' | 'ai';
          summary: string;
          keyPoints: string[];
        }>(`/api/page-insights?${params.toString()}`);
        const entry: PageInsights = {
          source: data.source,
          summary: data.summary ?? '',
          keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : []
        };
        setInsightsCache((prev) => ({ ...prev, [currentImage]: entry }));
        showToast(`Page insights ${data.source === 'ai' ? 'generated' : 'loaded'}`, 'success');
        return entry;
      } catch (error) {
        console.error(error);
        showToast('Unable to load page insights', 'error');
        return null;
      } finally {
        setInsightsLoading(false);
      }
    },
    [currentImage, insightsCache, showToast]
  );

  const toggleTextModal = useCallback(() => {
    setTextModalOpen((prev) => {
      const next = !prev;
      if (!prev) {
        void fetchPageText();
        void fetchPageInsights();
      }
      return next;
    });
  }, [fetchPageInsights, fetchPageText]);

  const closeTextModal = useCallback(() => setTextModalOpen(false), []);

  const resetTextState = useCallback(() => {
    setTextCache({});
    setInsightsCache({});
    setTextModalOpen(false);
    setTextLoading(false);
    setInsightsLoading(false);
    setRegeneratedText(false);
  }, []);

  const currentText = useMemo(() => {
    return currentImage ? textCache[currentImage] ?? null : null;
  }, [currentImage, textCache]);

  const currentInsights = useMemo(() => {
    return currentImage ? insightsCache[currentImage] ?? null : null;
  }, [currentImage, insightsCache]);

  return {
    closeTextModal,
    currentInsights,
    currentText,
    fetchPageInsights,
    fetchPageText,
    insightsLoading,
    regeneratedText,
    resetTextState,
    setRegeneratedText,
    textCache,
    textLoading,
    textModalOpen,
    toggleTextModal
  };
}
