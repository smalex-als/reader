import { useCallback } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import type { PageText } from '@/types/app';

interface UseCopyActionsOptions {
  currentImage: string | null;
  currentText: PageText | null;
  fetchPageText: () => Promise<PageText | null>;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useCopyActions({
  currentImage,
  currentText,
  fetchPageText,
  showToast
}: UseCopyActionsOptions) {
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

  const handleCopyVocabulary = useCallback(async (textValue: string) => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      showToast('No vocabulary available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(trimmed);
    showToast(copied ? 'Copied vocabulary to clipboard' : 'Unable to copy vocabulary', copied ? 'success' : 'error');
  }, [showToast]);

  const handleCopyMemoryCard = useCallback(async (textValue: string) => {
    const trimmed = textValue.trim();
    if (!trimmed) {
      showToast('No memory card available to copy', 'error');
      return;
    }
    const copied = await copyToClipboard(trimmed);
    showToast(copied ? 'Copied memory card to clipboard' : 'Unable to copy memory card', copied ? 'success' : 'error');
  }, [showToast]);

  return { handleCopyText, handleCopyVocabulary, handleCopyMemoryCard };
}
