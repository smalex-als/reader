import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { CHAPTER_NARRATION_PROMPT } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;
function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatNarrationFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.narration.txt`;
}

export async function generateChapterNarration({ bookId, chapterNumber }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const chapterFilename = formatChapterFilename(chapterNumber);
  const chapterPath = path.join(directory, chapterFilename);
  const chapterStat = await safeStat(chapterPath);
  if (!chapterStat?.isFile()) {
    throw createHttpError(404, 'Chapter file not found');
  }

  const rawText = await fs.readFile(chapterPath, 'utf8');
  const cleaned = rawText.trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for narration');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.2',
    messages: [
      {
        role: 'developer',
        content: [
          {
            type: 'text',
            text: CHAPTER_NARRATION_PROMPT
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: cleaned
          }
        ]
      }
    ]
  });

  const narration = response?.choices?.[0]?.message?.content?.trim() || '';
  if (!narration) {
    throw createHttpError(502, 'Narration generation returned empty text');
  }

  const narrationFilename = formatNarrationFilename(chapterNumber);
  const narrationPath = path.join(directory, narrationFilename);
  await fs.writeFile(narrationPath, narration, 'utf8');

  return {
    source: 'openai',
    url: `/data/${bookId}/${narrationFilename}`
  };
}
