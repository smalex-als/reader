import { useCallback, useEffect, useMemo, useState } from 'react';

interface PrintOption {
  id: string;
  label: string;
  detail: string;
  pages: number[];
}

interface UsePrintOptionsParams {
  bookId: string | null;
  manifest: string[];
  currentPage: number;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function usePrintOptions({ bookId, manifest, currentPage, showToast }: UsePrintOptionsParams) {
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printSelection, setPrintSelection] = useState<string>('current');
  const [printLoading, setPrintLoading] = useState(false);

  const printOptions = useMemo(() => {
    const options: PrintOption[] = [];
    const lastIndex = manifest.length - 1;
    if (manifest.length > 0) {
      options.push({
        id: 'current',
        label: 'Current page',
        detail: `Page ${currentPage + 1}`,
        pages: [currentPage]
      });
    }
    if (currentPage > 0) {
      options.push({
        id: 'prev-current',
        label: 'Previous + current',
        detail: `Pages ${currentPage}–${currentPage + 1}`,
        pages: [currentPage - 1, currentPage]
      });
    }
    if (currentPage < lastIndex && manifest.length > 0) {
      options.push({
        id: 'current-next',
        label: 'Current + next',
        detail: `Pages ${currentPage + 1}–${currentPage + 2}`,
        pages: [currentPage, currentPage + 1]
      });
    }
    if (currentPage > 0 && currentPage < lastIndex) {
      options.push({
        id: 'prev-current-next',
        label: 'Previous, current, next',
        detail: `Pages ${currentPage}–${currentPage + 2}`,
        pages: [currentPage - 1, currentPage, currentPage + 1]
      });
    }
    return options;
  }, [currentPage, manifest.length]);

  const selectedPrintOption =
    printOptions.find((option) => option.id === printSelection) ?? printOptions[0] ?? null;

  const openPrintModal = useCallback(() => {
    setPrintModalOpen(true);
    if (selectedPrintOption) {
      setPrintSelection(selectedPrintOption.id);
    }
  }, [selectedPrintOption]);

  const closePrintModal = useCallback(() => {
    setPrintModalOpen(false);
  }, []);

  const createPrintPdf = useCallback(async () => {
    if (!bookId || !selectedPrintOption) {
      return;
    }
    const pages = selectedPrintOption.pages
      .filter((index) => index >= 0 && index < manifest.length)
      .map((index) => manifest[index]);
    if (pages.length === 0) {
      showToast('No pages available to print', 'error');
      return;
    }
    try {
      setPrintLoading(true);
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages })
      });
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const serverFilename = match?.[1];
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const fallback = `${bookId}-pages-${selectedPrintOption.id}.pdf`;
      const filename = serverFilename || fallback;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast('PDF ready to print', 'success');
      setPrintModalOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Unable to create PDF', 'error');
    } finally {
      setPrintLoading(false);
    }
  }, [bookId, manifest, selectedPrintOption, showToast]);

  useEffect(() => {
    if (printOptions.length === 0) {
      setPrintSelection('current');
      return;
    }
    if (!printOptions.some((option) => option.id === printSelection)) {
      setPrintSelection(printOptions[0].id);
    }
  }, [printOptions, printSelection]);

  return {
    closePrintModal,
    createPrintPdf,
    openPrintModal,
    printLoading,
    printModalOpen,
    printOptions,
    printSelection,
    selectedPrintOption,
    setPrintSelection
  };
}
