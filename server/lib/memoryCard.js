import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory } from './books.js';
import { generateChapterText } from './chapters.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { CHAPTER_MEMORY_CARD_PROMPT } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatMemoryCardFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.memory-card.txt`;
}

export async function loadChapterMemoryCard({ bookId, chapterNumber }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const directory = await assertBookDirectory(bookId);
  const filename = formatMemoryCardFilename(chapterNumber);
  const filePath = path.join(directory, filename);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    throw createHttpError(404, 'Memory card file not found');
  }
  const text = (await fs.readFile(filePath, 'utf8')).trim();
  if (!text) {
    throw createHttpError(500, 'Memory card file is empty');
  }
  return {
    chapterNumber,
    title: `Chapter ${chapterNumber} Memory Card`,
    text,
    source: 'file',
    file: `/data/${bookId}/${filename}`
  };
}

export async function generateChapterMemoryCard({
  bookId,
  chapterNumber,
  force = false,
  pageStart = null,
  pageEnd = null
}) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const memoryCardFilename = formatMemoryCardFilename(chapterNumber);
  const memoryCardPath = path.join(directory, memoryCardFilename);
  if (!force) {
    const stat = await safeStat(memoryCardPath);
    if (stat?.isFile()) {
      return loadChapterMemoryCard({ bookId, chapterNumber });
    }
  }

  const chapterFilename = formatChapterFilename(chapterNumber);
  const chapterPath = path.join(directory, chapterFilename);
  let chapterStat = await safeStat(chapterPath);
  if (!chapterStat?.isFile()) {
    if (pageStart === null || pageEnd === null) {
      throw createHttpError(404, 'Chapter file not found');
    }
    await generateChapterText(bookId, pageStart, pageEnd, chapterNumber);
    chapterStat = await safeStat(chapterPath);
    if (!chapterStat?.isFile()) {
      throw createHttpError(404, 'Chapter file not found');
    }
  }

  const cleaned = (await fs.readFile(chapterPath, 'utf8')).trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for memory card generation');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.6-sol',
    messages: [
      {
        role: 'developer',
        content: [{ type: 'text', text: CHAPTER_MEMORY_CARD_PROMPT }]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: cleaned }]
      }
    ]
  });

  const text = response?.choices?.[0]?.message?.content?.trim() || '';
  if (!text) {
    throw createHttpError(502, 'Memory card generation returned empty text');
  }

  await fs.writeFile(memoryCardPath, text, 'utf8');
  return {
    chapterNumber,
    title: `Chapter ${chapterNumber} Memory Card`,
    text,
    source: 'openai',
    file: `/data/${bookId}/${memoryCardFilename}`
  };
}
