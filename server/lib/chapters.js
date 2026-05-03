import fs from 'node:fs/promises';
import path from 'node:path';
import {assertBookDirectory, loadBookCard, loadManifest} from './books.js';
import {CHAPTER_SIMPLE_PROMPT, CHAPTER_SPLIT_PROMPT} from '../config.js';
import {createHttpError} from './errors.js';
import {getOpenAI} from './openai.js';
import {loadPageText} from './ocr.js';
import {extractPlainTextFromOcrLayout} from './ocrLayout.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  const normalized = String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0');
  return `chapter${normalized}.txt`;
}

function isTechnicalCategory(category) {
  const normalized = typeof category === 'string' ? category.trim().toLowerCase() : '';
  return normalized === 'it' || normalized === 'tech' || normalized === 'technology' || normalized === 'programming';
}

async function getChapterPrompt(bookId) {
  const card = await loadBookCard(bookId);
  return isTechnicalCategory(card?.category) ? CHAPTER_SPLIT_PROMPT : CHAPTER_SIMPLE_PROMPT;
}

async function preprocessChapterTextForBook(bookId, rawText) {
  const input = typeof rawText === 'string' ? rawText.trim() : '';
  if (!input) {
    return '';
  }

  const prompt = await getChapterPrompt(bookId);
  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: 'gpt-5.5',
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: prompt }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: input }]
      }
    ]
  });
  const processed =
    response.output_text?.trim() ||
    response?.output?.[0]?.content?.[0]?.text?.trim() ||
    '';
  if (!processed) {
    console.warn('Chapter preprocessing returned empty text', {
      responseId: response?.id,
      model: response?.model
    });
  }
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
    const { text } = await loadPageText(imageUrl);
    const cleanedSource = extractPlainTextFromOcrLayout(text);
    const cleaned = typeof cleanedSource === 'string' ? cleanedSource.trim() : '';
    chunks.push(cleaned);
  }

  const combined = chunks.join('\n\n').trim();
  const directory = await assertBookDirectory(bookId);

  let processed = combined;
  try {
    processed = await preprocessChapterTextForBook(bookId, combined);
  } catch (error) {
    console.warn('Chapter preprocessing failed; saving original text', error);
  }
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
