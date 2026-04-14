import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory } from './books.js';
import { generateChapterText } from './chapters.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { CHAPTER_QUIZ_PROMPT } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatQuizFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.quiz.json`;
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

function normalizeQuizQuestion(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  const options = Array.isArray(raw.options)
    ? raw.options.map((option) => (typeof option === 'string' ? option.trim() : '')).filter(Boolean)
    : [];
  const correctIndex = Number.parseInt(raw.correctIndex, 10);
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  if (!prompt || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null;
  }
  return {
    id: `q${index + 1}`,
    prompt,
    options,
    correctIndex,
    explanation
  };
}

function normalizeQuiz(raw, chapterNumber) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Chapter ${chapterNumber} Quiz`;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((question, index) => normalizeQuizQuestion(question, index)).filter(Boolean)
    : [];
  if (questions.length === 0) {
    return null;
  }
  return { title, questions };
}

export async function loadChapterQuiz({ bookId, chapterNumber }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }
  const directory = await assertBookDirectory(bookId);
  const filename = formatQuizFilename(chapterNumber);
  const quizPath = path.join(directory, filename);
  const stat = await safeStat(quizPath);
  if (!stat?.isFile()) {
    throw createHttpError(404, 'Quiz file not found');
  }
  const raw = await fs.readFile(quizPath, 'utf8');
  const parsed = JSON.parse(raw);
  const quiz = normalizeQuiz(parsed, chapterNumber);
  if (!quiz) {
    throw createHttpError(500, 'Quiz file is invalid');
  }
  return {
    chapterNumber,
    source: 'file',
    file: `/data/${bookId}/${filename}`,
    ...quiz
  };
}

export async function generateChapterQuiz({ bookId, chapterNumber, force = false, pageStart = null, pageEnd = null }) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw createHttpError(400, 'Valid chapter number is required');
  }

  const directory = await assertBookDirectory(bookId);
  const quizFilename = formatQuizFilename(chapterNumber);
  const quizPath = path.join(directory, quizFilename);
  if (!force) {
    const quizStat = await safeStat(quizPath);
    if (quizStat?.isFile()) {
      return loadChapterQuiz({ bookId, chapterNumber });
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
    throw createHttpError(400, 'No text available for quiz generation');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      {
        role: 'developer',
        content: [{ type: 'text', text: CHAPTER_QUIZ_PROMPT }]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: cleaned }]
      }
    ]
  });

  const output = response?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = extractJsonObject(output);
  const quiz = normalizeQuiz(parsed, chapterNumber);
  if (!quiz) {
    throw createHttpError(502, 'Quiz generation returned invalid content');
  }

  const payload = {
    ...quiz,
    chapterNumber,
    generatedAt: new Date().toISOString(),
    source: 'openai'
  };
  await fs.writeFile(quizPath, JSON.stringify(payload, null, 2), 'utf8');

  return {
    chapterNumber,
    source: 'openai',
    file: `/data/${bookId}/${quizFilename}`,
    ...quiz
  };
}
