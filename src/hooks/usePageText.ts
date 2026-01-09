import { useCallback, useMemo, useState } from 'react';
import type { PageText } from '@/types/app';

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
  const [textLoading, setTextLoading] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
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
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(
          `/api/page-text?${params.toString()}`
        );
        const entry: PageText = {
          text: data.text,
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

  const toggleTextModal = useCallback(() => {
    setTextModalOpen((prev) => {
      const next = !prev;
      if (!prev) {
        void fetchPageText();
      }
      return next;
    });
  }, [fetchPageText]);

  const closeTextModal = useCallback(() => setTextModalOpen(false), []);

  const savePageText = useCallback(
    async (nextText: string): Promise<PageText | null> => {
      if (!currentImage) {
        return null;
      }
      setTextSaving(true);
      try {
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(`/api/page-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: currentImage, text: nextText })
        });
        const entry: PageText = {
          text: data.text,
          source: data.source
        };
        setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
        setRegeneratedText(false);
        showToast('Page text saved', 'success');
        return entry;
      } catch (error) {
        console.error(error);
        showToast('Unable to save page text', 'error');
        return null;
      } finally {
        setTextSaving(false);
      }
    },
    [currentImage, showToast]
  );

  const resetTextState = useCallback(() => {
    setTextCache({});
    setTextModalOpen(false);
    setTextLoading(false);
    setTextSaving(false);
    setRegeneratedText(false);
  }, []);

  const currentText = useMemo(() => {
    return currentImage ? textCache[currentImage] ?? null : null;
  }, [currentImage, textCache]);

  return {
    closeTextModal,
    currentText,
    fetchPageText,
    regeneratedText,
    resetTextState,
    savePageText,
    setRegeneratedText,
    textCache,
    textLoading,
    textModalOpen,
    textSaving,
    toggleTextModal
  };
}
