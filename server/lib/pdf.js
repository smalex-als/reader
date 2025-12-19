import path from 'node:path';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mime from 'mime-types';
import { PDFDocument } from 'pdf-lib';
import { PDF_EXTENSIONS } from '../config.js';
import { createHttpError } from './errors.js';
import { ensureDataDir, safeStat } from './fs.js';
import { getBookDirectory, loadManifest } from './books.js';
import { validateBookImage } from './paths.js';

const execFileAsync = promisify(execFile);

function slugifyFilename(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80) || 'pages'
  );
}

async function removePathSafe(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

export async function createBookFromPdf(buffer, filename) {
  ensureDataDir();
  const ext = (path.extname(filename || '') || '').toLowerCase();
  if (ext && !PDF_EXTENSIONS.has(ext)) {
    throw createHttpError(400, 'Only PDF files are supported');
  }

  const baseName = slugifyFilename(path.basename(filename || 'book', ext || undefined) || 'book');
  let bookId = baseName || 'book';
  let suffix = 1;
  while (await safeStat(getBookDirectory(bookId))) {
    bookId = `${baseName}-${suffix}`;
    suffix += 1;
  }

  const bookDir = getBookDirectory(bookId);
  await fs.mkdir(bookDir, { recursive: true });

  const tempPath = path.join(
    tmpdir(),
    `upload-${Date.now()}-${Math.random().toString(16).slice(2)}${ext || '.pdf'}`
  );
  await fs.writeFile(tempPath, buffer);

  try {
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '200', tempPath, 'page'], { cwd: bookDir });
  } catch (error) {
    await removePathSafe(bookDir);
    throw createHttpError(
      500,
      'Failed to process PDF. Ensure pdftoppm is installed and the file is valid.'
    );
  } finally {
    await removePathSafe(tempPath);
  }

  try {
    const manifest = await loadManifest(bookId);
    return { bookId, manifest };
  } catch (error) {
    await removePathSafe(bookDir);
    throw error;
  }
}

export async function createPdfFromImages(bookId, imageUrls) {
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

export function derivePrintFilename(bookId, label) {
  return slugifyFilename(`${bookId}-${label}`);
}
