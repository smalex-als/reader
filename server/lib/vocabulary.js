import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory } from './books.js';
import { generateChapterText } from './chapters.js';
import { createHttpError } from './errors.js';
import { safeStat, writeFileAtomic } from './fs.js';
import { CHAPTER_VOCAB_PROMPT } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatVocabularyFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.vocab.json`;
}

function extractJsonObject(text) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) {
    return null;
  }
  const fenced = input.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate = fenced?.[1]?.trim() || input;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeVocabularyItem(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const term = typeof raw.term === 'string' ? raw.term.trim() : '';
  const definition = typeof raw.definition === 'string' ? raw.definition.trim() : '';
  if (!term || !definition) {
    return null;
  }
  return {
    id: `term-${index + 1}`,
    term,
    definition
  };
}

function normalizeVocabulary(raw, chapterNumber) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const title =
    typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Chapter ${chapterNumber} Vocabulary`;
  const items = Array.isArray(raw.items)
    ? raw.items.map((item, index) => normalizeVocabularyItem(item, index)).filter(Boolean)
    : [];
  if (items.length === 0) {
    return null;
  }
  return { title, items };
}

export async function loadChapterVocabulary({ bookId, chapterNumber }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const directory = await assertBookDirectory(bookId);
  const filename = formatVocabularyFilename(chapterNumber);
  const filePath = path.join(directory, filename);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    throw createHttpError(404, 'Vocabulary file not found');
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const vocabulary = normalizeVocabulary(parsed, chapterNumber);
  if (!vocabulary) {
    throw createHttpError(500, 'Vocabulary file is invalid');
  }
  return {
    chapterNumber,
    source: 'file',
    file: `/data/${bookId}/${filename}`,
    ...vocabulary
  };
}

export async function generateChapterVocabulary({ bookId, chapterNumber, force = false, pageStart = null, pageEnd = null }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const vocabularyFilename = formatVocabularyFilename(chapterNumber);
  const vocabularyPath = path.join(directory, vocabularyFilename);
  if (!force) {
    const vocabularyStat = await safeStat(vocabularyPath);
    if (vocabularyStat?.isFile()) {
      return loadChapterVocabulary({ bookId, chapterNumber });
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

  const rawText = await fs.readFile(chapterPath, 'utf8');
  const cleaned = rawText.trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for vocabulary generation');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      {
        role: 'developer',
        content: [{ type: 'text', text: CHAPTER_VOCAB_PROMPT }]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: cleaned }]
      }
    ]
  });

  const output = response?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = extractJsonObject(output);
  const vocabulary = normalizeVocabulary(parsed, chapterNumber);
  if (!vocabulary) {
    throw createHttpError(502, 'Vocabulary generation returned invalid content');
  }

  const payload = {
    ...vocabulary,
    chapterNumber,
    generatedAt: new Date().toISOString(),
    source: 'openai'
  };
  await writeFileAtomic(vocabularyPath, JSON.stringify(payload, null, 2));

  return {
    chapterNumber,
    source: 'openai',
    file: `/data/${bookId}/${vocabularyFilename}`,
    ...vocabulary
  };
}
