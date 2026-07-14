import { useCallback, useMemo } from 'react';
import { useConfirmation } from '@/components/ConfirmationProvider';
import { useToast } from '@/hooks/useToast';
import {
  addSortedBook,
  bookSessionHandlers,
  createBookSessionActions
} from '@/hooks/bookSessionActions';
import { clamp } from '@/lib/math';
import type { CreateChapterSource } from '@/api/bookSession';
import { saveLastBook, saveLastPage } from '@/lib/storage';
import {
  appActions,
  selectBookIds,
  selectBookType,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useChapterActions() {
  const { confirmAction } = useConfirmation();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const books = useAppSelector(selectBookIds);
  const bookType = useAppSelector(selectBookType);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyCreatedChapter: (data) => {
          const newBookId = data.book;
          dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
          dispatch(appActions.setReaderBookId(newBookId));
          dispatch(appActions.setBookSessionBookType('text'));
          dispatch(appActions.setBookSessionChapterCount(data.chapterCount));
          dispatch(appActions.setBookSessionManifest([]));
          dispatch(appActions.setTocEntries(data.toc));
          dispatch(appActions.setReaderCurrentPage(data.chapterIndex ?? 0));
          dispatch(appActions.setEditorChapterNumber(data.chapterIndex !== null ? data.chapterIndex + 1 : null));
          dispatch(appActions.setEditorOpen(!data.sourceAudioJob));
          dispatch(appActions.setReaderViewMode('text'));
          dispatch(appActions.setModalOpen('bookSelect', false));
        },
        applyDeletedChapter: (targetBookId, chapterNumber, data) => {
          const nextChapterCount = data.chapterCount;
          const nextToc = data.toc;
          dispatch(appActions.setBookSessionChapterCount(nextChapterCount));
          dispatch(appActions.setTocEntries(nextToc));
          if (nextChapterCount <= 0) {
            dispatch(appActions.setReaderCurrentPage(0));
          } else {
            const deletedIndex = data.chapterIndex ?? chapterNumber - 1;
            const sortedPages = nextToc
              .map((entry) => entry.page)
              .filter((page) => Number.isInteger(page) && page >= 0 && page < nextChapterCount)
              .sort((a, b) => a - b);
            const nextExistingPage =
              sortedPages.find((page) => page > deletedIndex) ??
              [...sortedPages].reverse().find((page) => page < deletedIndex) ??
              clamp(Math.min(deletedIndex, nextChapterCount - 1), 0, nextChapterCount - 1);
            dispatch(appActions.setReaderCurrentPage(nextExistingPage));
            saveLastPage(targetBookId, nextExistingPage);
          }
          dispatch(appActions.setEditorOpen(false));
          dispatch(appActions.setEditorChapterNumber(null));
        },
        setUploadingChapter: (uploading) => dispatch(appActions.setBookSessionUploadingChapter(uploading)),
        setDeletingChapter: (deleting) => dispatch(appActions.setBookSessionDeletingChapter(deleting)),
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [books, dispatch, showToast]
  );

  const handleCreateChapter = useCallback(
    async (details: {
      bookName: string;
      chapterTitle: string;
      source?: CreateChapterSource;
      sourceUrl?: string;
      postProcessPromptId?: string;
    }) => {
      const bookName = details.bookName.trim();
      const chapterTitle = details.chapterTitle.trim();
      const targetBookId = bookName || bookId || '';
      const source = details.source ?? 'blank';
      const sourceUrl = details.sourceUrl?.trim() ?? '';
      const postProcessPromptId = details.postProcessPromptId?.trim() ?? '';
      if (!targetBookId) {
        showToast('Book name is required for a new text book', 'error');
        return;
      }
      if (!bookName && bookId && bookType !== 'text') {
        showToast('Select a text book or enter a new book name', 'error');
        return;
      }
      if (source === 'youtube' && !sourceUrl) {
        showToast('YouTube URL is required', 'error');
        return;
      }
      await bookSessionHandlers.runAction('createChapter', null, actions, {
        bookName,
        chapterTitle,
        targetBookId,
        isExisting: books.includes(targetBookId),
        source,
        sourceUrl,
        postProcessPromptId
      });
    },
    [actions, bookId, bookType, books, showToast]
  );

  const handleDeleteChapter = useCallback(
    async (chapterNumber: number) => {
      if (!bookId || bookType !== 'text') {
        return;
      }
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        showToast('Valid chapter is required', 'error');
        return;
      }
      await confirmAction({
        title: `Delete chapter ${chapterNumber}?`,
        description: `Chapter ${chapterNumber} and its text in “${bookId}” will be permanently deleted. Other chapter numbers will stay unchanged.`,
        confirmLabel: 'Delete chapter',
        action: () => bookSessionHandlers.runAction('deleteChapter', null, actions, {
          bookId,
          chapterNumber
        })
      });
    },
    [actions, bookId, bookType, confirmAction, showToast]
  );

  return {
    handleCreateChapter,
    handleDeleteChapter
  };
}

export function useDeleteBook() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyDeletedBook: (targetBookId, currentBookId, data) => {
          dispatch(appActions.setBookSessionBooks(data.books));
          if (currentBookId !== targetBookId) {
            return;
          }
          if (data.books.length === 0) {
            dispatch(appActions.setReaderBookId(null));
            dispatch(appActions.setModalOpen('bookSelect', true));
            showToast('No books found. Add files to /data to begin.', 'info');
            return;
          }
          const fallback = data.books[0];
          dispatch(appActions.setReaderBookId(fallback));
          saveLastBook(fallback);
        },
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [dispatch, showToast]
  );

  return useCallback(
    async (targetBookId: string) => {
      await bookSessionHandlers.runAction('deleteBook', null, actions, {
        targetBookId,
        currentBookId: bookId
      });
    },
    [actions, bookId]
  );
}

export function useUploadPdf() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const books = useAppSelector(selectBookIds);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyUploadedPdf: (data) => {
          const newBookId = data.book;
          dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
          dispatch(appActions.setReaderBookId(newBookId));
          dispatch(appActions.setBookSessionBookType('image'));
          dispatch(appActions.setBookSessionChapterCount(0));
          dispatch(appActions.setBookSessionManifest(data.manifest));
          dispatch(appActions.setTocEntries([]));
          dispatch(appActions.setDetailedTocEntries([]));
          dispatch(appActions.setReaderCurrentPage(0));
          dispatch(appActions.setReaderViewMode('pages'));
          dispatch(appActions.setModalOpen('bookSelect', false));
        },
        setUploadingPdf: (uploading) => dispatch(appActions.setBookSessionUploadingPdf(uploading)),
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [books, dispatch, showToast]
  );

  return useCallback(
    async (file: File) => {
      await bookSessionHandlers.runAction('uploadPdf', null, actions, { file });
    },
    [actions]
  );
}

export function useUploadChapter() {
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const books = useAppSelector(selectBookIds);
  const bookType = useAppSelector(selectBookType);
  const actions = useMemo(
    () =>
      createBookSessionActions({
        applyUploadedChapter: (data) => {
          const newBookId = data.book;
          dispatch(appActions.setBookSessionBooks(addSortedBook(books, newBookId)));
          dispatch(appActions.setReaderBookId(newBookId));
          dispatch(appActions.setBookSessionBookType('text'));
          dispatch(appActions.setBookSessionChapterCount(data.chapterCount));
          dispatch(appActions.setBookSessionManifest([]));
          dispatch(appActions.setTocEntries(data.toc));
          dispatch(appActions.setReaderCurrentPage(data.chapterIndex ?? 0));
          dispatch(appActions.setReaderViewMode('text'));
          dispatch(appActions.setModalOpen('bookSelect', false));
        },
        setUploadingChapter: (uploading) => dispatch(appActions.setBookSessionUploadingChapter(uploading)),
        showSuccess: (message) => showToast(message, 'success'),
        showError: (message) => showToast(message, 'error')
      }),
    [books, dispatch, showToast]
  );

  return useCallback(
    async (file: File, details: { bookName: string; chapterTitle: string }) => {
      const bookName = details.bookName.trim();
      const chapterTitle = details.chapterTitle.trim();
      const targetBookId = bookName || bookId || '';
      if (!targetBookId) {
        showToast('Book name is required for a new text book', 'error');
        return;
      }
      if (!bookName && bookId && bookType !== 'text') {
        showToast('Select a text book or enter a new book name', 'error');
        return;
      }
      const isExisting = books.includes(targetBookId);
      await bookSessionHandlers.runAction('uploadChapter', null, actions, {
        file,
        bookName,
        chapterTitle,
        targetBookId,
        isExisting
      });
    },
    [actions, bookId, bookType, books, showToast]
  );
}
