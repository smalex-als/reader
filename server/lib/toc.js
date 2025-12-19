import fs from 'node:fs/promises';
import path from 'node:path';
import { TOC_FILENAME, TOC_PROMPT } from '../config.js';
import { assertBookDirectory, loadManifest } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { deriveTextPathsFromImageUrl } from './paths.js';
import { getOpenAI } from './openai.js';

function sanitizeTocEntry(raw, maxPageIndex) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const page = Number.parseInt(raw.page, 10);
  if (!title || !Number.isInteger(page)) {
    return null;
  }
  if (page < 0 || page > maxPageIndex) {
    return null;
  }
  return { title, page };
}

export async function loadToc(bookId) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, TOC_FILENAME);
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
  const manifest = await loadManifest(bookId);
  const maxPageIndex = Math.max(0, manifest.length - 1);
  return parsed
    .map((entry) => sanitizeTocEntry(entry, maxPageIndex))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
}

export async function saveToc(bookId, toc) {
  const directory = await assertBookDirectory(bookId);
  const manifest = await loadManifest(bookId);
  const maxPageIndex = Math.max(0, manifest.length - 1);
  const normalized = (Array.isArray(toc) ? toc : [])
    .map((entry) => sanitizeTocEntry(entry, maxPageIndex))
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);
  const filePath = path.join(directory, TOC_FILENAME);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function extractJsonArray(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const snippet = text.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    return null;
  }
}

export async function generateTocFromOcr(bookId) {
  const manifest = await loadManifest(bookId);
  const snippets = [];
  const MAX_SNIPPET_CHARS = 800;
  const MAX_PAGES = 500;

  for (let index = 0; index < manifest.length; index += 1) {
    if (snippets.length >= MAX_PAGES) {
      break;
    }
    const imageUrl = manifest[index];
    const { textAbsolute } = deriveTextPathsFromImageUrl(imageUrl);
    const stat = await safeStat(textAbsolute);
    if (!stat?.isFile()) {
      continue;
    }
    const content = await fs.readFile(textAbsolute, 'utf8');
    const trimmed = content.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      continue;
    }
    snippets.push({
      page: index + 1,
      text: trimmed.slice(0, MAX_SNIPPET_CHARS)
    });
  }

  if (snippets.length === 0) {
    throw createHttpError(400, 'No OCR text found for this book');
  }

  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: 'gpt-5.2',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: TOC_PROMPT },
          { type: 'input_text', text: JSON.stringify({ pages: snippets }) }
        ]
      }
    ]
  });

  const raw =
    response.output_text?.trim() ||
    response?.output?.[0]?.content?.[0]?.text?.trim() ||
    '';

  const parsed = extractJsonArray(raw);
  if (!Array.isArray(parsed)) {
    throw createHttpError(502, 'Unable to generate table of contents');
  }

  const maxPageIndex = Math.max(0, manifest.length - 1);
  const normalized = parsed
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      const page = Number.parseInt(entry.page, 10);
      if (!title || !Number.isInteger(page)) {
        return null;
      }
      const pageIndex = page - 1;
      if (pageIndex < 0 || pageIndex > maxPageIndex) {
        return null;
      }
      return { title, page: pageIndex };
    })
    .filter(Boolean)
    .sort((a, b) => a.page - b.page);

  return saveToc(bookId, normalized);
}
