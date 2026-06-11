import { useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import type { PageText } from '@/types/app';

interface UseCopyActionsOptions {
  currentImage: string | null;
  currentText: PageText | null;
  fetchPageText: () => Promise<PageText | null>;
}

export function useCopyActions({
  currentImage,
  currentText,
  fetchPageText
}: UseCopyActionsOptions) {
  const { showToast } = useToast();

  const handleCopyText = useCallback(async (overrideText?: string) => {
    if (!overrideText && !currentImage) {
      showToast('No page selected', 'error');
      return;
    }
    const pageText = overrideText ? null : currentText ?? (await fetchPageText());
    const textValue = (overrideText ?? pageText?.text ?? '').trim();
    if (!textValue) {
      showToast('No text available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(textValue);
    showToast(copied ? 'Copied page text to clipboard' : 'Unable to copy text', copied ? 'success' : 'error');
  }, [currentImage, currentText, fetchPageText, showToast]);

  return { handleCopyText };
}
