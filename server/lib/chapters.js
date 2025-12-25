import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory, loadManifest } from './books.js';
import { CHAPTER_SPLIT_PROMPT, LLMPROXY_AUTH, LLMPROXY_ENDPOINT, LLMPROXY_MODEL } from '../config.js';
import { createHttpError } from './errors.js';
import { loadPageText } from './ocr.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  const normalized = String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0');
  return `chapter${normalized}.txt`;
}

async function preprocessChapterText(rawText) {
  const input = typeof rawText === 'string' ? rawText.trim() : '';
  if (!input) {
    return '';
  }

  const prompt = `${CHAPTER_SPLIT_PROMPT}\n\nSOURCE_START\n${input}\nSOURCE_END`;
  const response = await fetch(LLMPROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLMPROXY_AUTH}`
    },
    body: JSON.stringify({
      model: LLMPROXY_MODEL,
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw createHttpError(
      502,
      `Chapter preprocessing failed (${response.status} ${response.statusText})`
    );
  }

  const payload = await response.json();
  const processed = typeof payload?.response === 'string' ? payload.response.trim() : '';
  return processed || input;
}

export async function generateChapterText(bookId, pageStart, pageEnd, chapterNumber) {
  if (!Number.isInteger(pageStart) || pageStart < 0) {
    throw createHttpError(400, 'Valid pageStart is required');
  }
  if (!Number.isInteger(pageEnd) || pageEnd <= pageStart) {
    throw createHttpError(400, 'Valid pageEnd is required');
  }
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapterNumber is required');
  }

  const manifest = await loadManifest(bookId);
  if (pageStart >= manifest.length) {
    throw createHttpError(400, 'pageStart exceeds page count');
  }
  if (pageEnd > manifest.length) {
    throw createHttpError(400, 'pageEnd exceeds page count');
  }

  const imageUrls = manifest.slice(pageStart, pageEnd);
  if (imageUrls.length === 0) {
    throw createHttpError(400, 'No pages found for requested range');
  }

  const chunks = [];
  for (const imageUrl of imageUrls) {
    const { text } = await loadPageText(imageUrl, { skipNarration: true });
    const cleaned = typeof text === 'string' ? text.trim() : '';
    chunks.push(cleaned);
  }

  const combined = chunks.join('\n\n').trim();
  let processed = combined;
  try {
    processed = await preprocessChapterText(combined);
  } catch (error) {
    console.warn('Chapter preprocessing failed; saving original text', error);
  }
  const directory = await assertBookDirectory(bookId);
  const filename = formatChapterFilename(chapterNumber);
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, processed, 'utf8');

  return {
    book: bookId,
    chapterNumber,
    file: `/data/${bookId}/${filename}`,
    pages: {
      start: pageStart,
      end: pageEnd,
      count: imageUrls.length
    }
  };
}
