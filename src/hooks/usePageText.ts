import { useCallback, useMemo, useState } from 'react';
import { deriveTextUrl } from '@/lib/paths';
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
  const [regeneratedText, setRegeneratedText] = useState(false);

  const fetchPageText = useCallback(
    async (force = false) => {
      if (!currentImage) {
        return;
      }
      const cached = textCache[currentImage];
      if (cached && !force) {
        return;
      }

      setTextLoading(true);
      try {
        if (!force) {
          const directUrl = deriveTextUrl(currentImage);
          try {
            const response = await fetch(directUrl);
            if (response.ok) {
              const text = await response.text();
              const entry: PageText = { text, source: 'file' };
              setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
              setRegeneratedText(false);
              return;
            }
          } catch {
            // fall back to API
          }
        }

        const params = new URLSearchParams({ image: currentImage });
        if (force) {
          params.set('skipCache', '1');
        }
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(
          `/api/page-text?${params.toString()}`
        );
        const entry: PageText = { text: data.text, source: data.source };
        setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
        setRegeneratedText(data.source === 'ai' || force);
        showToast(`Page text ${data.source === 'ai' ? 'generated' : 'loaded'}`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to load page text', 'error');
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

  const resetTextState = useCallback(() => {
    setTextCache({});
    setTextModalOpen(false);
    setTextLoading(false);
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
    setRegeneratedText,
    textCache,
    textLoading,
    textModalOpen,
    toggleTextModal
  };
}
