import { useCallback, useEffect, useMemo } from 'react';
import { createBookPrintPdf } from '@/api/print';
import {
  appActions,
  selectBookManifest,
  selectPrintWorkflow,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';

interface PrintOption {
  id: string;
  label: string;
  detail: string;
  pages: number[];
  disabled?: boolean;
}

type PrintPayloads = {
  createPrintPdf: {
    bookId: string | null;
    pages: string[];
    fallbackFilename: string;
  };
};

type PrintActions = {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  closeModal: () => void;
  downloadPdf: (blob: Blob, filename: string) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const printHandlers = createActionHandlerRegistry<unknown, PrintActions, PrintPayloads>();
const { addActionHandler } = printHandlers;

addActionHandler('createPrintPdf', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId || payload.pages.length === 0) {
    actions.showError('No pages available to print');
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to create PDF',
    request: () =>
      createBookPrintPdf({
        bookId: payload.bookId!,
        pages: payload.pages,
        fallbackFilename: payload.fallbackFilename
      }),
    onSuccess: ({ blob, filename }) => {
      actions.downloadPdf(blob, filename);
      actions.showSuccess('PDF ready to print');
      actions.closeModal();
    },
    onError: (error) => {
      console.error(error);
      actions.showError('Unable to create PDF');
    }
  });
});

export function usePrintOptions() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const { selection: printSelection } = useAppSelector(selectPrintWorkflow);

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
    dispatch(appActions.openModal('print'));
    if (selectedPrintOption) {
      dispatch(appActions.setPrintSelection(selectedPrintOption.id));
    }
  }, [dispatch, selectedPrintOption]);

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
    const actions: PrintActions = {
      setLoading: (loading) => dispatch(appActions.setPrintLoading(loading)),
      setError: () => undefined,
      closeModal: () => dispatch(appActions.closeModal('print')),
      downloadPdf: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      },
      showError: (message) => showToast(message, 'error'),
      showSuccess: (message) => showToast(message, 'success')
    };
    await printHandlers.runAction('createPrintPdf', undefined, actions, {
      bookId,
      pages,
      fallbackFilename: `${bookId}-pages-${selectedPrintOption.id}.pdf`
    });
  }, [bookId, dispatch, manifest, selectedPrintOption, showToast]);

  useEffect(() => {
    if (printOptions.length === 0) {
      dispatch(appActions.setPrintSelection('current'));
      return;
    }
    if (!printOptions.some((option) => option.id === printSelection)) {
      dispatch(appActions.setPrintSelection(printOptions[0].id));
    }
  }, [dispatch, printOptions, printSelection]);

  return {
    createPrintPdf,
    openPrintModal,
    printOptions
  };
}
