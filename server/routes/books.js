import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import multer from 'multer';
import { derivePrintFilename, createPdfFromImages } from '../lib/pdf.js';
import {
  deleteBook,
  getBookType,
  listBookCards,
  listBooks,
  loadBookCard,
  loadManifest,
  updateBookCard
} from '../lib/books.js';
import { normalizeBookId } from '../lib/paths.js';
import { createHttpError } from '../lib/errors.js';
import { asyncHandler } from '../lib/async.js';
import { safeStat } from '../lib/fs.js';
import {
  deriveBookmarkLabelFromImage,
  deriveBookmarkLabelFromText,
  loadBookmarks,
  sanitizeBookmarkInput,
  saveBookmarks
} from '../lib/bookmarks.js';
import { generateTocFromOcr, loadToc, saveToc } from '../lib/toc.js';
import { attachTocStats } from '../lib/tocStats.js';
import { generateChapterText } from '../lib/chapters.js';
import {
  cancelChapterAudioJob,
  clearCompletedChapterAudioJob,
  enqueueChapterAudioJob,
  getChapterAudioJob
} from '../lib/chapterAudioJobs.js';
import {
  addPromptToLibrary,
  createChapterTextVersion,
  deleteChapterTextVersion,
  deletePromptFromLibrary,
  listChapterTextPromptLibrary,
  listChapterTextVersions,
  updatePromptInLibrary
} from '../lib/chapterTextVersions.js';
import { generateChapterMemoryCard, loadChapterMemoryCard } from '../lib/memoryCard.js';
import { generateChapterQuiz, loadChapterQuiz } from '../lib/quiz.js';
import { generateChapterVocabulary, loadChapterVocabulary } from '../lib/vocabulary.js';
import { createEnhancedImagePreview, createImagePreviewCrop } from '../lib/imagePreview.js';
import { DATA_DIR, MAX_UPLOAD_BYTES } from '../config.js';
import { formatChapterAudioFilename } from '../lib/streamAudio.js';
import {
  addTextChapter,
  createTextBook,
  createEmptyTextChapter,
  getTextChapterCount,
  updateTextChapter
} from '../lib/textBooks.js';
import {
  buildBookSearchIndex,
  invalidateBookSearchIndex,
  searchBook
} from '../lib/search.js';
import { loadLibraryState, updateLibraryState } from '../lib/libraryState.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });
const CHAPTER_PAD_LENGTH = 3;
const execFileAsync = promisify(execFile);

function formatChapterSuffix(chapterNumber) {
  return String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0');
}

async function getAudioDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const value = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function resolveChapterAudioUrl(bookId, chapterNumber, versionId = 'base') {
  const audioFilename = formatChapterAudioFilename(chapterNumber, versionId);
  const audioPath = path.join(DATA_DIR, bookId, audioFilename);
  const audioStat = await safeStat(audioPath);
  return audioStat?.isFile?.() ? `/data/${bookId}/${audioFilename}` : null;
}

async function loadChapterAudioMeta(bookId, chapterNumber, versionId = 'base') {
  const metaFilename = `${formatChapterAudioFilename(chapterNumber, versionId)}.meta.json`;
  const metaPath = path.join(DATA_DIR, bookId, metaFilename);
  const metaStat = await safeStat(metaPath);
  if (!metaStat?.isFile()) {
    return null;
  }
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      versionId: typeof parsed?.versionId === 'string' ? parsed.versionId : 'base',
      provider: parsed?.provider === 'xai' || parsed?.provider === 'yandex' ? parsed.provider : 'default',
      generatedAt: typeof parsed?.generatedAt === 'string' ? parsed.generatedAt : null
    };
  } catch {
    return null;
  }
}

router.get('/api/books', asyncHandler(async (_req, res) => {
  const books = await listBooks();
  res.json({ books });
}));

router.get('/api/books/cards', asyncHandler(async (_req, res) => {
  const books = await listBookCards();
  res.json({ books });
}));

router.get('/api/library/state', asyncHandler(async (_req, res) => {
  const state = await loadLibraryState();
  res.json(state);
}));

router.put('/api/library/state', asyncHandler(async (req, res) => {
  const state = await updateLibraryState(req.body || {});
  res.json(state);
}));

router.get('/api/chapter-text-prompts', asyncHandler(async (_req, res) => {
  const library = await listChapterTextPromptLibrary();
  res.json(library);
}));

router.post('/api/chapter-text-prompts', asyncHandler(async (req, res) => {
  const { library, prompt } = await addPromptToLibrary({
    name: typeof req.body?.name === 'string' ? req.body.name : '',
    template: typeof req.body?.template === 'string' ? req.body.template : ''
  });
  res.json({ ...library, prompt });
}));

router.put('/api/chapter-text-prompts/:promptId', asyncHandler(async (req, res) => {
  const library = await updatePromptInLibrary({
    promptId: req.params.promptId,
    name: typeof req.body?.name === 'string' ? req.body.name : '',
    template: typeof req.body?.template === 'string' ? req.body.template : ''
  });
  res.json(library);
}));

router.delete('/api/chapter-text-prompts/:promptId', asyncHandler(async (req, res) => {
  const library = await deletePromptFromLibrary({ promptId: req.params.promptId });
  res.json(library);
}));

router.get('/api/books/:id/meta', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const meta = await loadBookCard(bookId);
  res.json(meta);
}));

router.get('/api/books/:id/image-preview', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const image = typeof req.query.image === 'string' ? req.query.image : '';
  const left = Number(req.query.left);
  const top = Number(req.query.top);
  const right = Number(req.query.right);
  const bottom = Number(req.query.bottom);
  const { tempPath } = await createImagePreviewCrop({
    bookId,
    imageFilename: image,
    bounds: [left, top, right, bottom]
  });

  res.sendFile(tempPath, (error) => {
    void fs.rm(path.dirname(tempPath), { recursive: true, force: true });
    if (error && !res.headersSent) {
      res.status(error.statusCode || 500).end();
    }
  });
}));

router.post('/api/books/:id/image-preview/enhance', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const imageFilename = typeof req.body?.image === 'string' ? req.body.image : '';
  const bounds = Array.isArray(req.body?.bounds) ? req.body.bounds : null;
  const caption = typeof req.body?.caption === 'string' ? req.body.caption : null;
  const result = await createEnhancedImagePreview({
    bookId,
    imageFilename,
    bounds,
    caption
  });
  res.json(result);
}));

router.put('/api/books/:id/meta', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const meta = await updateBookCard(bookId, req.body || {});
  res.json(meta);
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

router.get('/api/books/:id/audio', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  res.setHeader('Cache-Control', 'no-store');
  const toc = await loadToc(bookId);
  const chapters = await Promise.all(
    toc.map(async (entry, index) => {
      const chapterNumber = index + 1;
      const versions = await listChapterTextVersions({ bookId, chapterNumber }).catch((error) => {
        if (error?.status === 404) {
          return null;
        }
        throw error;
      });
      const latestVersionId = versions?.latestVersionId ?? 'base';
      const audioFilename = formatChapterAudioFilename(chapterNumber, latestVersionId);
      const audioPath = path.join(DATA_DIR, bookId, audioFilename);
      const [audioStat, audioMeta] = await Promise.all([
        safeStat(audioPath),
        loadChapterAudioMeta(bookId, chapterNumber, latestVersionId)
      ]);
      const audioSize = audioStat?.isFile?.() ? audioStat.size : null;
      const audioDurationSeconds = audioStat?.isFile?.()
        ? await getAudioDurationSeconds(audioPath)
        : null;
      return {
        chapterNumber,
        title: entry.title,
        page: entry.page,
        latestVersionId,
        audio: {
          ready: Boolean(audioStat?.isFile?.()),
          url: `/data/${bookId}/${audioFilename}`,
          bytes: audioSize,
          durationSeconds: audioDurationSeconds,
          versionId: audioMeta?.versionId ?? null,
          provider: audioMeta?.provider ?? 'default'
        }
      };
    })
  );
  res.json({ book: bookId, chapters });
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
  const variant = req.query.variant === 'detailed' ? 'detailed' : 'main';
  const toc = await loadToc(bookId, { variant });
  const includeStats = req.query.includeStats === '1' || req.query.includeStats === 'true';
  res.json({ book: bookId, toc: includeStats ? await attachTocStats(bookId, toc) : toc });
}));

router.post('/api/books/:id/toc', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { toc } = req.body || {};
  const variant = req.query.variant === 'detailed' ? 'detailed' : 'main';
  const saved = await saveToc(bookId, toc, { variant });
  await invalidateBookSearchIndex(bookId);
  res.json({ book: bookId, toc: saved });
}));

router.post('/api/books/:id/toc/generate', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const variant = req.query.variant === 'detailed' ? 'detailed' : 'main';
  const detailLevel = req.query.detailLevel === 'detailed' ? 'detailed' : 'normal';
  const toc = await generateTocFromOcr(bookId, { variant, detailLevel });
  await invalidateBookSearchIndex(bookId);
  res.json({ book: bookId, toc });
}));

router.get('/api/books/:id/search', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = typeof req.query.limit === 'string' ? req.query.limit : undefined;
  const autoBuildParam = req.query.autoBuild;
  const autoBuild =
    typeof autoBuildParam === 'string'
      ? !['0', 'false', 'no'].includes(autoBuildParam.toLowerCase())
      : true;
  const result = await searchBook(bookId, query, { limit, autoBuild });
  res.json(result);
}));

router.post('/api/books/:id/search/index', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const index = await buildBookSearchIndex(bookId);
  res.json({
    book: bookId,
    builtAt: index.builtAt,
    documents: index.documents.length,
    terms: Object.keys(index.terms).length
  });
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

router.post('/api/books/:id/chapters/:chapter/audio', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const voice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : '';
  const versionId = typeof req.body?.versionId === 'string' ? req.body.versionId.trim() : null;
  const provider =
    req.body?.provider === 'xai' || req.body?.provider === 'yandex' ? req.body.provider : 'default';
  const job = await enqueueChapterAudioJob({ bookId, chapterNumber, voice, versionId, provider });
  res.json({ book: bookId, chapterNumber, job });
}));

router.delete('/api/books/:id/chapters/:chapter/audio', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const versionId =
    typeof req.query.versionId === 'string' && req.query.versionId.trim()
      ? req.query.versionId.trim()
      : 'base';
  const job = await getChapterAudioJob(bookId, chapterNumber);
  if (job?.status === 'queued' || job?.status === 'running') {
    throw createHttpError(409, 'Cancel the active audio job before deleting MP3');
  }

  const audioFilename = formatChapterAudioFilename(chapterNumber, versionId);
  const audioPath = path.join(DATA_DIR, bookId, audioFilename);
  const metaPath = `${audioPath}.meta.json`;
  const audioStat = await safeStat(audioPath);
  for (const targetPath of [audioPath, metaPath]) {
    try {
      await fs.unlink(targetPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  await clearCompletedChapterAudioJob(bookId, chapterNumber, versionId);
  res.json({
    book: bookId,
    chapterNumber,
    versionId,
    deleted: Boolean(audioStat?.isFile?.()),
    audio: {
      ready: false,
      url: null,
      versionId: null
    }
  });
}));

router.get('/api/books/:id/chapters/:chapter/audio/status', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  res.setHeader('Cache-Control', 'no-store');
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const requestedVersionId =
    typeof req.query.versionId === 'string' && req.query.versionId.trim() ? req.query.versionId.trim() : 'base';
  const job = await getChapterAudioJob(bookId, chapterNumber);
  const lookupVersionId = job?.versionId ?? requestedVersionId;
  const [audioUrl, audioMeta] = await Promise.all([
    resolveChapterAudioUrl(bookId, chapterNumber, lookupVersionId),
    loadChapterAudioMeta(bookId, chapterNumber, lookupVersionId)
  ]);
  if (!job && audioUrl) {
    res.json({
      book: bookId,
      chapterNumber,
      job: {
        bookId,
        chapterNumber,
        provider: audioMeta?.provider ?? 'default',
        status: 'completed',
        versionId: audioMeta?.versionId ?? 'base',
        startedAt: null,
        updatedAt: new Date().toISOString(),
        error: null,
        audioUrl
      }
    });
    return;
  }
  res.json({
    book: bookId,
    chapterNumber,
    job: job
      ? {
          ...job,
          audioUrl: job.audioUrl ?? audioUrl
        }
      : null
  });
}));

router.post('/api/books/:id/chapters/:chapter/audio/cancel', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const job = await cancelChapterAudioJob(bookId, chapterNumber);
  res.json({ book: bookId, chapterNumber, job });
}));

router.post('/api/books/:id/chapters/:chapter/narration', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await createChapterTextVersion({
    bookId,
    chapterNumber,
    promptId: 'narration-default'
  });
  res.json({ book: bookId, chapterNumber, ...result });
}));

router.get('/api/books/:id/chapters/:chapter/text-versions', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await listChapterTextVersions({ bookId, chapterNumber });
  res.json({ book: bookId, ...result });
}));

router.post('/api/books/:id/chapters/:chapter/text-versions', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await createChapterTextVersion({
    bookId,
    chapterNumber,
    sourceVersionId: typeof req.body?.sourceVersionId === 'string' ? req.body.sourceVersionId.trim() : 'base',
    model: typeof req.body?.model === 'string' ? req.body.model.trim() : 'gpt-5.4',
    promptId: typeof req.body?.promptId === 'string' ? req.body.promptId.trim() : null,
    customPrompt: typeof req.body?.customPrompt === 'string' ? req.body.customPrompt : '',
    addToLibrary: req.body?.addToLibrary === true,
    promptName: typeof req.body?.promptName === 'string' ? req.body.promptName : ''
  });
  res.json({ book: bookId, chapterNumber, ...result });
}));

router.delete('/api/books/:id/chapters/:chapter/text-versions/:versionId', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await deleteChapterTextVersion({
    bookId,
    chapterNumber,
    versionId: req.params.versionId
  });
  res.json({ book: bookId, chapterNumber, ...result });
}));

router.get('/api/books/:id/chapters/:chapter/quiz', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await loadChapterQuiz({ bookId, chapterNumber });
  res.json({ book: bookId, ...result });
}));

router.get('/api/books/:id/chapters/:chapter/memory-card', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await loadChapterMemoryCard({ bookId, chapterNumber });
  res.json({ book: bookId, ...result });
}));

router.post('/api/books/:id/chapters/:chapter/memory-card', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const force = req.body?.force === true;
  const pageStart =
    typeof req.body?.pageStart === 'number' ? req.body.pageStart : Number.parseInt(req.body?.pageStart, 10);
  const pageEnd =
    typeof req.body?.pageEnd === 'number' ? req.body.pageEnd : Number.parseInt(req.body?.pageEnd, 10);
  const result = await generateChapterMemoryCard({
    bookId,
    chapterNumber,
    force,
    pageStart: Number.isInteger(pageStart) ? pageStart : null,
    pageEnd: Number.isInteger(pageEnd) ? pageEnd : null
  });
  res.json({ book: bookId, ...result });
}));

router.post('/api/books/:id/chapters/:chapter/quiz', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const force = req.body?.force === true;
  const pageStart =
    typeof req.body?.pageStart === 'number' ? req.body.pageStart : Number.parseInt(req.body?.pageStart, 10);
  const pageEnd =
    typeof req.body?.pageEnd === 'number' ? req.body.pageEnd : Number.parseInt(req.body?.pageEnd, 10);
  const result = await generateChapterQuiz({
    bookId,
    chapterNumber,
    force,
    pageStart: Number.isInteger(pageStart) ? pageStart : null,
    pageEnd: Number.isInteger(pageEnd) ? pageEnd : null
  });
  res.json({ book: bookId, ...result });
}));

router.get('/api/books/:id/chapters/:chapter/vocabulary', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const result = await loadChapterVocabulary({ bookId, chapterNumber });
  res.json({ book: bookId, ...result });
}));

router.post('/api/books/:id/chapters/:chapter/vocabulary', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const force = req.body?.force === true;
  const pageStart =
    typeof req.body?.pageStart === 'number' ? req.body.pageStart : Number.parseInt(req.body?.pageStart, 10);
  const pageEnd =
    typeof req.body?.pageEnd === 'number' ? req.body.pageEnd : Number.parseInt(req.body?.pageEnd, 10);
  const result = await generateChapterVocabulary({
    bookId,
    chapterNumber,
    force,
    pageStart: Number.isInteger(pageStart) ? pageStart : null,
    pageEnd: Number.isInteger(pageEnd) ? pageEnd : null
  });
  res.json({ book: bookId, ...result });
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
  await invalidateBookSearchIndex(bookId);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.post('/api/books/text/empty', asyncHandler(async (req, res) => {
  const { bookName, chapterTitle } = req.body || {};
  const bookId = await createTextBook(bookName);
  const result = await createEmptyTextChapter(bookId, chapterTitle);
  await invalidateBookSearchIndex(bookId);
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
  await invalidateBookSearchIndex(bookId);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.post('/api/books/:id/chapters/empty', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const { chapterTitle } = req.body || {};
  const result = await createEmptyTextChapter(bookId, chapterTitle);
  await invalidateBookSearchIndex(bookId);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

router.put('/api/books/:id/chapters/:chapter', asyncHandler(async (req, res) => {
  const bookId = normalizeBookId(req.params.id);
  const chapterNumber = Number.parseInt(req.params.chapter, 10);
  const { content, title } = req.body || {};
  const result = await updateTextChapter(bookId, chapterNumber, content, title);
  await invalidateBookSearchIndex(bookId);
  const chapterCount = await getTextChapterCount(bookId);
  res.json({ book: bookId, bookType: 'text', chapterCount, ...result });
}));

export default router;
