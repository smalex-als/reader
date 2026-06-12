import {
  createEmptyTextChapter,
  deleteBook,
  deleteTextChapter,
  fetchBookIds,
  uploadTextChapter,
  uploadPdfBook,
  type DeleteBookResult,
  type TextChapterMutationResult,
  type UploadPdfResult
} from '@/api/bookSession';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import { removeBookStorage } from '@/lib/storage';

const BOOK_SORT_OPTIONS = { numeric: true, sensitivity: 'base' } as const;

type BookSessionPayloads = {
  loadBooks: {
    currentBookId: string | null;
  };
  createChapter: {
    bookName: string;
    chapterTitle: string;
    targetBookId: string;
    isExisting: boolean;
  };
  deleteChapter: {
    bookId: string;
    chapterNumber: number;
  };
  deleteBook: {
    targetBookId: string;
    currentBookId: string | null;
  };
  uploadPdf: {
    file: File;
  };
  uploadChapter: {
    file: File;
    bookName: string;
    chapterTitle: string;
    targetBookId: string;
    isExisting: boolean;
  };
};

export type BookSessionActions = {
  applyLoadedBooks: (books: string[], currentBookId: string | null) => void;
  applyCreatedChapter: (result: TextChapterMutationResult) => void;
  applyDeletedChapter: (bookId: string, chapterNumber: number, result: TextChapterMutationResult) => void;
  applyDeletedBook: (targetBookId: string, currentBookId: string | null, result: DeleteBookResult) => void;
  applyUploadedPdf: (result: UploadPdfResult) => void;
  applyUploadedChapter: (result: TextChapterMutationResult) => void;
  setUploadingChapter: (uploading: boolean) => void;
  setDeletingChapter: (deleting: boolean) => void;
  setUploadingPdf: (uploading: boolean) => void;
  showInfo: (message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

export const bookSessionHandlers = createActionHandlerRegistry<
  null,
  BookSessionActions,
  BookSessionPayloads
>();
const { addActionHandler } = bookSessionHandlers;

addActionHandler('loadBooks', async (_state, actions, payload): Promise<void> => {
  try {
    const books = await fetchBookIds();
    actions.applyLoadedBooks(books, payload.currentBookId);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to load books');
  }
});

addActionHandler('createChapter', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingChapter(true);
  try {
    const result = await createEmptyTextChapter(payload);
    actions.applyCreatedChapter(result);
    actions.showSuccess('Chapter created');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to create chapter');
  } finally {
    actions.setUploadingChapter(false);
  }
});

addActionHandler('deleteChapter', async (_state, actions, payload): Promise<void> => {
  actions.setDeletingChapter(true);
  try {
    const result = await deleteTextChapter(payload.bookId, payload.chapterNumber);
    actions.applyDeletedChapter(payload.bookId, payload.chapterNumber, result);
    actions.showSuccess(`Deleted chapter ${result.chapterNumber ?? payload.chapterNumber}`);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to delete chapter');
  } finally {
    actions.setDeletingChapter(false);
  }
});

addActionHandler('deleteBook', async (_state, actions, payload): Promise<void> => {
  try {
    const result = await deleteBook(payload.targetBookId);
    removeBookStorage(payload.targetBookId);
    actions.applyDeletedBook(payload.targetBookId, payload.currentBookId, result);
    actions.showSuccess(`Deleted ${result.book}`);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to delete book');
  }
});

addActionHandler('uploadPdf', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingPdf(true);
  try {
    const result = await uploadPdfBook(payload.file);
    actions.applyUploadedPdf(result);
    actions.showSuccess('Book created from PDF');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to upload PDF');
  } finally {
    actions.setUploadingPdf(false);
  }
});

addActionHandler('uploadChapter', async (_state, actions, payload): Promise<void> => {
  actions.setUploadingChapter(true);
  try {
    const result = await uploadTextChapter(payload);
    actions.applyUploadedChapter(result);
    actions.showSuccess('Chapter uploaded');
  } catch (error) {
    console.error(error);
    actions.showError('Failed to upload chapter');
  } finally {
    actions.setUploadingChapter(false);
  }
});

const EMPTY_BOOK_SESSION_ACTIONS: BookSessionActions = {
  applyLoadedBooks: () => {},
  applyCreatedChapter: () => {},
  applyDeletedChapter: () => {},
  applyDeletedBook: () => {},
  applyUploadedPdf: () => {},
  applyUploadedChapter: () => {},
  setUploadingChapter: () => {},
  setDeletingChapter: () => {},
  setUploadingPdf: () => {},
  showInfo: () => {},
  showSuccess: () => {},
  showError: () => {}
};

export function createBookSessionActions(actions: Partial<BookSessionActions>): BookSessionActions {
  return {
    ...EMPTY_BOOK_SESSION_ACTIONS,
    ...actions
  };
}

export function addSortedBook(books: string[], bookId: string) {
  const next = Array.from(new Set([...books, bookId]));
  next.sort((a, b) => a.localeCompare(b, 'en', BOOK_SORT_OPTIONS));
  return next;
}
