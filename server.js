import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import { OpenAI } from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DIST_DIR = path.join(__dirname, 'dist');
const STATIC_ROOT = existsSync(DIST_DIR) ? DIST_DIR : __dirname;

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const TEXT_PROMPT = `Transcribe the scanned book page as clean, readable text. Preserve line breaks only where they indicate new paragraphs or headings. Ignore page numbers, footers, and obvious scanning artifacts. Do not add commentary.`;
const DEFAULT_VOICE = 'santa';

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

app.use('/data', express.static(DATA_DIR, { fallthrough: false }));
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

async function listBooks() {
  ensureDataDir();
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => collator.compare(a, b));
}

async function loadManifest(bookId) {
  const directory = path.join(DATA_DIR, bookId);
  const stat = await safeStat(directory);
  if (!stat?.isDirectory()) {
    throw createHttpError(404, 'Book not found');
  }

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

async function loadPageText(imageUrl) {
  const { absolute, relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);

  const textStat = await safeStat(textAbsolute);
  if (textStat?.isFile()) {
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
            type: 'text',
            text: TEXT_PROMPT
          },
          {
            type: 'image_url',
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

async function handlePageAudio({ image, text, voice }) {
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

  const trimmedText = (text || '').trim();
  let spokenText = trimmedText;

  if (!spokenText) {
    // try to reuse generated text
    const generated = await loadPageText(image);
    spokenText = generated.text.trim();
  }

  if (!spokenText) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  const openai = getOpenAI();
  const resolvedVoice = typeof voice === 'string' && voice.trim().length > 0 ? voice.trim() : DEFAULT_VOICE;

  const speech = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: resolvedVoice,
    input: spokenText
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
  await fs.writeFile(audioAbsolute, audioBuffer);

  return {
    source: 'ai',
    url: `/data/${audioRelative}`
  };
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
    const result = await loadPageText(image);
    res.json({ source: result.source, text: result.text });
  })
);

app.post(
  '/api/page-audio',
  asyncHandler(async (req, res) => {
    const { image, text, voice } = req.body || {};
    if (!image) {
      throw createHttpError(400, 'Image is required');
    }
    const result = await handlePageAudio({ image, text, voice });
    res.json(result);
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
