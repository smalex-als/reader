import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import { OpenAI } from 'openai';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_ROOT = existsSync(DIST_DIR) ? DIST_DIR : __dirname;

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const BOOKMARKS_FILENAME = 'bookmarks.txt';
const DEFAULT_VOICE = 'santa';
const TEXT_PROMPT = `Extract all visible text from this image as plain text. Preserve paragraph structure and spacing. Normalize all fractions: instead of Unicode characters like ½ or ¼, use plain text equivalents like 1/2, 1/4, 1 1/2, etc. Do not use emojis, special characters, or markdown. Keep the content exactly as it appears, but ensure formatting is consistent: use normal paragraphs with one empty line between them. Preserve line breaks and indentation only where they represent clear paragraph or step boundaries. Ignore page numbers, footers, and obvious scanning artifacts. Do not add commentary.`;
const voiceProfiles = {
    santa: {
        openAiVoice: 'ash',
        instructions: `Identity: Santa Claus

Affect: Jolly, warm, and cheerful, with a playful and magical quality that fits Santa's personality.

Tone: Festive and welcoming, creating a joyful, holiday atmosphere for the caller.

Emotion: Joyful and playful, filled with holiday spirit, ensuring the caller feels excited and appreciated.

Pronunciation: Clear, articulate, and exaggerated in key festive phrases to maintain clarity and fun.

Pause: Brief pauses after each option and statement to allow for processing and to add a natural flow to the message.`
    }
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true
});

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/data', express.static(DATA_DIR));
app.use('/data', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.status(404).end();
    return;
  }
  next();
});
app.use(express.static(STATIC_ROOT));

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    throw createHttpError(404, 'Data directory not found');
  }
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeBookId(rawId) {
  const bookId = decodeURIComponent(rawId || '').trim();
  if (!bookId) {
    throw createHttpError(400, 'Book id required');
  }
  if (bookId.includes('..') || bookId.includes(path.sep)) {
    throw createHttpError(400, 'Invalid book id');
  }
  return bookId;
}

function resolveDataUrl(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') {
    throw createHttpError(400, 'Image path required');
  }
  if (!urlPath.startsWith('/data/')) {
    throw createHttpError(400, 'Image path must start with /data/');
  }
  const relative = urlPath.slice('/data/'.length);
  const resolved = path.normalize(path.join(DATA_DIR, relative));
  if (!resolved.startsWith(DATA_DIR)) {
    throw createHttpError(400, 'Path escapes data directory');
  }
  return { relative, absolute: resolved };
}

function validateBookImage(bookId, imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith(`/data/${bookId}/`)) {
    throw createHttpError(400, 'Image must belong to requested book');
  }
  return resolveDataUrl(imageUrl);
}

async function listBooks() {
  ensureDataDir();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => collator.compare(a, b));
}

async function loadManifest(bookId) {
  const directory = await assertBookDirectory(bookId);

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const manifest = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => collator.compare(a, b))
    .map((filename) => `/data/${bookId}/${filename}`);

  if (manifest.length === 0) {
    throw createHttpError(404, 'No images found for book');
  }

  return manifest;
}

async function safeStat(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

let openaiClient = null;

function getBookDirectory(bookId) {
  return path.join(DATA_DIR, bookId);
}

async function assertBookDirectory(bookId) {
  const directory = getBookDirectory(bookId);
  const stat = await safeStat(directory);
  if (!stat?.isDirectory()) {
    throw createHttpError(404, 'Book not found');
  }
  return directory;
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw createHttpError(503, 'OPENAI_API_KEY is required for this operation');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  return openaiClient;
}

async function loadPageText(imageUrl, options = {}) {
  const { skipCache = false } = options;
  const { absolute, relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);

  const textStat = await safeStat(textAbsolute);
  if (textStat?.isFile() && !skipCache) {
    const textContent = await fs.readFile(textAbsolute, 'utf8');
    return {
      source: 'file',
      text: textContent,
      url: `/data/${textRelative}`,
      absolutePath: textAbsolute
    };
  }

  const imageStat = await safeStat(absolute);
  if (!imageStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const mimeType = mime.lookup(absolute);
  if (!mimeType) {
    throw createHttpError(400, 'Unsupported image type');
  }

  const openai = getOpenAI();
  const buffer = await fs.readFile(absolute);
  const base64 = buffer.toString('base64');

  const response = await openai.responses.create({
    model: 'gpt-4o',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: TEXT_PROMPT
          },
          {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${base64}`
          }
        ]
      }
    ]
  });

  const text =
    response.output_text?.trim() ||
    response?.output?.[0]?.content?.[0]?.text?.trim() ||
    '';

  if (!text) {
    throw createHttpError(502, 'Failed to generate text');
  }

  await fs.mkdir(path.dirname(textAbsolute), { recursive: true });
  await fs.writeFile(textAbsolute, text, 'utf8');

  return {
    source: 'ai',
    text,
    url: `/data/${textRelative}`,
    absolutePath: textAbsolute
  };
}

async function handlePageAudio({ image, voiceProfile }) {
  const { absolute, relative } = resolveDataUrl(image);
  const sourceStat = await safeStat(absolute);
  if (!sourceStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const baseName = relative.replace(/\.[^.]+$/, '');
  const audioRelative = `${baseName}.mp3`;
  const audioAbsolute = path.join(DATA_DIR, audioRelative);

  const existingAudio = await safeStat(audioAbsolute);
  if (existingAudio?.isFile()) {
    return {
      source: 'file',
      url: `/data/${audioRelative}`
    };
  }

  const generated = await loadPageText(image);
  const spokenText = generated.text.trim();

  if (!spokenText) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  const openai = getOpenAI();
  const speech = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voiceProfile.openAiVoice,
    input: spokenText,
    format: 'mp3',
    instructions: voiceProfile.instructions
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
  await fs.writeFile(audioAbsolute, audioBuffer);

  return {
    source: 'ai',
    url: `/data/${audioRelative}`
  };
}

function deriveBookmarkLabel(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return 'Page';
  }
  const filename = imageUrl.split('/').pop() || imageUrl;
  return filename.replace(/\.[^.]+$/, '') || filename;
}

function sanitizeBookmark(raw, bookId) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const page = Number.parseInt(raw.page, 10);
  const image = typeof raw.image === 'string' ? raw.image : '';
  if (!Number.isInteger(page) || page < 0) {
    return null;
  }
  if (!image.startsWith(`/data/${bookId}/`)) {
    return null;
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : deriveBookmarkLabel(image);
  return {
    page,
    image,
    label: label || deriveBookmarkLabel(image)
  };
}

async function loadBookmarks(bookId) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, BOOKMARKS_FILENAME);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    return [];
  }
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed = [];
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      parsed = json;
    }
  } catch {
    // ignore parse failures and fall back to empty list
  }
  return parsed
    .map((entry) => sanitizeBookmark(entry, bookId))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
}

async function saveBookmarks(bookId, bookmarks) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, BOOKMARKS_FILENAME);
  const normalized = (Array.isArray(bookmarks) ? bookmarks : [])
    .map((entry) => sanitizeBookmark(entry, bookId))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

async function deriveBookmarkLabelFromText(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);
  const stat = await safeStat(textAbsolute);
  if (!stat?.isFile()) {
    return null;
  }
  try {
    const content = await fs.readFile(textAbsolute, 'utf8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
    return firstLine?.trim() || null;
  } catch {
    return null;
  }
}

function slugifyFilename(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'pages';
}

async function createPdfFromImages(bookId, imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw createHttpError(400, 'At least one page is required for printing');
  }
  if (imageUrls.length > 10) {
    throw createHttpError(400, 'Too many pages requested (max 10)');
  }

  const pdf = await PDFDocument.create();

  for (const imageUrl of imageUrls) {
    const { absolute } = validateBookImage(bookId, imageUrl);
    const stat = await safeStat(absolute);
    if (!stat?.isFile()) {
      throw createHttpError(404, 'Requested page not found');
    }
    const buffer = await fs.readFile(absolute);
    const mimeType = mime.lookup(absolute);
    const isPng = mimeType === 'image/png';
    const isJpg = mimeType === 'image/jpeg' || mimeType === 'image/jpg';
    if (!isPng && !isJpg) {
      throw createHttpError(400, 'Only PNG and JPEG pages can be printed');
    }
    const embedded = isPng ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
    const { width, height } = embedded;
    const page = pdf.addPage([width, height]);
    page.drawImage(embedded, { x: 0, y: 0, width, height });
  }

  return Buffer.from(await pdf.save());
}

app.get(
  '/api/books',
  asyncHandler(async (_req, res) => {
    const books = await listBooks();
    res.json({ books });
  })
);

app.get(
  '/api/books/:id/manifest',
  asyncHandler(async (req, res) => {
    const bookId = normalizeBookId(req.params.id);
    const manifest = await loadManifest(bookId);
    res.json({ book: bookId, manifest });
  })
);

app.get(
  '/api/page-text',
  asyncHandler(async (req, res) => {
    const image = req.query.image;
    const skipCacheParam = req.query.skipCache;
    const skipCache =
      typeof skipCacheParam === 'string'
        ? ['1', 'true', 'yes'].includes(skipCacheParam.toLowerCase())
        : Array.isArray(skipCacheParam)
        ? skipCacheParam.some((value) => ['1', 'true', 'yes'].includes(String(value).toLowerCase()))
        : false;
    const result = await loadPageText(image, { skipCache });
    res.json({ source: result.source, text: result.text });
  })
);

app.post(
  '/api/page-audio',
  asyncHandler(async (req, res) => {
    const { image, voice } = req.body || {};
    if (!image) {
      throw createHttpError(400, 'Image is required');
    }
    const requestedVoiceId = typeof voice === 'string' && voice.trim().length ? voice.trim().toLowerCase() : '';
    const voiceProfile = voiceProfiles[requestedVoiceId] || voiceProfiles[DEFAULT_VOICE];
    const result = await handlePageAudio({ image, voiceProfile });
    res.json(result);
  })
);

app.post(
  '/api/books/:id/print',
  asyncHandler(async (req, res) => {
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
    const baseLabel = textLabel || deriveBookmarkLabel(primaryPage);
    const slug = slugifyFilename(`${bookId}-${baseLabel}`);
    const pdfBuffer = await createPdfFromImages(bookId, images);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
    res.send(pdfBuffer);
  })
);

app.get(
  '/api/books/:id/bookmarks',
  asyncHandler(async (req, res) => {
    const bookId = normalizeBookId(req.params.id);
    const bookmarks = await loadBookmarks(bookId);
    res.json({ book: bookId, bookmarks });
  })
);

app.post(
  '/api/books/:id/bookmarks',
  asyncHandler(async (req, res) => {
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
    const nextEntry = sanitizeBookmark(
      { page, image, label: labelFromText ?? deriveBookmarkLabel(image) },
      bookId
    );
    if (!nextEntry) {
      throw createHttpError(400, 'Invalid bookmark payload');
    }
    const deduped = existing.filter((entry) => entry.page !== nextEntry.page);
    const updated = await saveBookmarks(bookId, [...deduped, nextEntry]);
    res.json({ book: bookId, bookmarks: updated });
  })
);

app.delete(
  '/api/books/:id/bookmarks',
  asyncHandler(async (req, res) => {
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
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  const indexPath = path.join(STATIC_ROOT, 'index.html');
  if (existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return next();
});

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  // eslint-disable-next-line no-console
  console.error('Error handling request', { status, message, stack: err.stack });
  res
    .status(status)
    .json({ error: message, status });
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
