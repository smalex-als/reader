import express from 'express';
import multer from 'multer';
import { derivePrintFilename, createPdfFromImages } from '../lib/pdf.js';
import { deleteBook, getBookType, listBooks, loadManifest } from '../lib/books.js';
import { normalizeBookId } from '../lib/paths.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import {
  deriveBookmarkLabelFromImage,
  deriveBookmarkLabelFromText,
  loadBookmarks,
  sanitizeBookmarkInput,
  saveBookmarks
} from '../lib/bookmarks.js';
import { generateTocFromOcr, loadToc, saveToc } from '../lib/toc.js';
import { generateChapterText } from '../lib/chapters.js';
import { MAX_UPLOAD_BYTES } from '../config.js';
import {
  addTextChapter,
  createTextBook,
  createEmptyTextChapter,
  getTextChapterCount,
  updateTextChapter
} from '../lib/textBooks.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

router.get('/api/books', asyncHandler(async (_req, res) => {
  const books = await listBooks();
  res.json({ books });
}));

router.get('/api/books/:id/manifest', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const bookType = await getBookType(bookId);
  if (bookType === 'text') {
    const chapterCount = await getTextChapterCount(bookId);
    res.json({ book: bookId, manifest: [], bookType, chapterCount });
    return;
  }
  const manifest = await loadManifest(bookId);
  res.json({ book: bookId, manifest, bookType });
}));

router.delete('/api/books/:id', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  await deleteBook(bookId);
  const books = await listBooks();
  res.json({ book: bookId, books });
}));

router.post('/api/books/:id/print', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { pages } = req.body || {};
  if (!Array.isArray(pages)) {
    throw createHttpError(400, 'Pages array is required');
  }
  const images = pages.map((value) => {
    if (typeof value !== 'string') {
      throw createHttpError(400, 'Pages must be image URLs');
    }
    return value;
  });
  const primaryPage = images[0];
  const textLabel = await deriveBookmarkLabelFromText(primaryPage);
  const baseLabel = textLabel || deriveBookmarkLabelFromImage(primaryPage);
  const slug = derivePrintFilename(bookId, baseLabel);
  const pdfBuffer = await createPdfFromImages(bookId, images);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
  res.send(pdfBuffer);
}));

router.get('/api/books/:id/bookmarks', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const bookmarks = await loadBookmarks(bookId);
  res.json({ book: bookId, bookmarks });
}));

router.post('/api/books/:id/bookmarks', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { page, image } = req.body || {};
  if (!Number.isInteger(page) || page < 0) {
    throw createHttpError(400, 'Valid page index is required');
  }
  if (typeof image !== 'string' || !image.startsWith(`/data/${bookId}/`)) {
    throw createHttpError(400, 'Bookmark image must belong to this book');
  }
  const existing = await loadBookmarks(bookId);
  const labelFromText = await deriveBookmarkLabelFromText(image);
  const nextEntry = sanitizeBookmarkInput(
    { page, image, label: labelFromText ?? deriveBookmarkLabelFromImage(image) },
    bookId
  );
  if (!nextEntry) {
    throw createHttpError(400, 'Invalid bookmark payload');
  }
  const deduped = existing.filter((entry) => entry.page !== nextEntry.page);
  const updated = await saveBookmarks(bookId, [...deduped, nextEntry]);
  res.json({ book: bookId, bookmarks: updated });
}));

router.delete('/api/books/:id/bookmarks', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const pageParam = req.query.page;
  const page = typeof pageParam === 'string' ? Number.parseInt(pageParam, 10) : null;
  if (!Number.isInteger(page) || page < 0) {
    throw createHttpError(400, 'Valid page is required to remove bookmark');
  }
  const existing = await loadBookmarks(bookId);
  const filtered = existing.filter((entry) => entry.page !== page);
  const updated = await saveBookmarks(bookId, filtered);
  res.json({ book: bookId, bookmarks: updated });
}));

router.get('/api/books/:id/toc', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const toc = await loadToc(bookId);
  res.json({ book: bookId, toc });
}));

router.post('/api/books/:id/toc', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { toc } = req.body || {};
  const saved = await saveToc(bookId, toc);
  res.json({ book: bookId, toc: saved });
}));

router.post('/api/books/:id/toc/generate', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const toc = await generateTocFromOcr(bookId);
  res.json({ book: bookId, toc });
}));

router.post('/api/books/:id/chapters/generate', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { pageStart, pageEnd, chapterNumber } = req.body || {};
  const start = typeof pageStart === 'string' ? Number.parseInt(pageStart, 10) : pageStart;
  const end = typeof pageEnd === 'string' ? Number.parseInt(pageEnd, 10) : pageEnd;
  const chapter = typeof chapterNumber === 'string' ? Number.parseInt(chapterNumber, 10) : chapterNumber;
  const result = await generateChapterText(bookId, start, end, chapter);
  res.json(result);
}));

router.post('/api/books/text', upload.single('file'), asyncHandler(async (req, res) => {
  const { bookName, chapterTitle } = req.body || {};
  const file = req.file;
  if (!file) {
    throw createHttpError(400, 'Chapter file is required');
  }
  const content = file.buffer.toString('utf8');
  const bookId = await createTextBook(bookName);
  const result = await addTextChapter(bookId, { title: chapterTitle, content });
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.post('/api/books/text/empty', asyncHandler(async (req, res) => {
  const { bookName, chapterTitle } = req.body || {};
  const bookId = await createTextBook(bookName);
  const result = await createEmptyTextChapter(bookId, chapterTitle);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.post('/api/books/:id/chapters', upload.single('file'), asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { chapterTitle } = req.body || {};
  const file = req.file;
  if (!file) {
    throw createHttpError(400, 'Chapter file is required');
  }
  const content = file.buffer.toString('utf8');
  const result = await addTextChapter(bookId, { title: chapterTitle, content });
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.post('/api/books/:id/chapters/empty', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { chapterTitle } = req.body || {};
  const result = await createEmptyTextChapter(bookId, chapterTitle);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.put('/api/books/:id/chapters/:chapter', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const { content, title } = req.body || {};
  const result = await updateTextChapter(bookId, chapterNumber, content, title);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

export default router;
