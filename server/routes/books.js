import express from 'express';
import { derivePrintFilename, createPdfFromImages } from '../lib/pdf.js';
import { listBooks, loadManifest } from '../lib/books.js';
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

const router = express.Router();

router.get('/api/books', asyncHandler(async (_req, res) => {
  const books = await listBooks();
  res.json({ books });
}));

router.get('/api/books/:id/manifest', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const manifest = await loadManifest(bookId);
  res.json({ book: bookId, manifest });
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

export default router;
