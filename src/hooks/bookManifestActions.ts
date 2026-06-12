import {
  fetchBookManifest,
  type BookManifestResult
} from '@/api/bookSession';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import type { ViewMode } from '@/lib/appConstants';

type BookManifestPayloads = {
  loadBookManifest: {
    bookId: string;
    pendingPage: number | null;
    requestedPageFromLocation: number | null;
    requestedViewFromLocation: ViewMode | null;
  };
};

export type BookManifestActions = {
  applyLoadedManifest: (
    result: BookManifestResult,
    options: Pick<
      BookManifestPayloads['loadBookManifest'],
      'pendingPage' | 'requestedPageFromLocation' | 'requestedViewFromLocation'
    >
  ) => void;
  resetBookManifest: () => void;
  setLoading: (loading: boolean) => void;
  showError: (message: string) => void;
};

export const bookManifestHandlers = createActionHandlerRegistry<
  null,
  BookManifestActions,
  BookManifestPayloads
>();
const { addActionHandler } = bookManifestHandlers;

addActionHandler('loadBookManifest', async (_state, actions, payload): Promise<void> => {
  actions.setLoading(true);
  try {
    const result = await fetchBookManifest(payload.bookId);
    actions.applyLoadedManifest(result, {
      pendingPage: payload.pendingPage,
      requestedPageFromLocation: payload.requestedPageFromLocation,
      requestedViewFromLocation: payload.requestedViewFromLocation
    });
  } catch (error) {
    console.error(error);
    actions.showError('Unable to load book manifest');
    actions.resetBookManifest();
  } finally {
    actions.setLoading(false);
  }
});

const EMPTY_BOOK_MANIFEST_ACTIONS: BookManifestActions = {
  applyLoadedManifest: () => {},
  resetBookManifest: () => {},
  setLoading: () => {},
  showError: () => {}
};

export function createBookManifestActions(actions: Partial<BookManifestActions>): BookManifestActions {
  return {
    ...EMPTY_BOOK_MANIFEST_ACTIONS,
    ...actions
  };
}
