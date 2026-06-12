import { useCallback } from 'react';
import { usePageText } from '@/hooks/usePageText';
import { useToast } from '@/hooks/useToast';
import { copyToClipboard } from '@/lib/clipboard';
import {
  selectBookManifest,
  selectReaderSession,
  useAppSelector
} from '@/state/appState';

export function useCopyActions() {
  const { showToast } = useToast();
  const { currentPage } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const currentImage = manifest[currentPage] ?? null;
  const { currentText, fetchPageText } = usePageText();

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
