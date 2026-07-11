import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory } from './books.js';
import { generateChapterText } from './chapters.js';
import { createHttpError } from './errors.js';
import { safeStat, writeFileAtomic } from './fs.js';
import { loadUnitTopic } from './units.js';
import { CHAPTER_QUIZ_PROMPT } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatQuizFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.quiz.json`;
}

function formatUnitTopicQuizFilename(topic) {
  const contentFile = typeof topic.contentFile === 'string' ? path.basename(topic.contentFile) : '';
  if (contentFile.endsWith('.json') && !contentFile.endsWith('.quiz.json')) {
    return contentFile.replace(/\.json$/, '.quiz.json');
  }
  return `${topic.topicId}.quiz.json`;
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

function normalizeQuiz(raw, fallbackTitle) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallbackTitle;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((question, index) => normalizeQuizQuestion(question, index)).filter(Boolean)
    : [];
  if (questions.length === 0) {
    return null;
  }
  return { title, questions };
}

async function generateQuizFromText({ text, fallbackTitle, sourceScope }) {
  const cleaned = text.trim();
  if (!cleaned) {
    throw createHttpError(400, 'No text available for quiz generation');
  }

  const prompt = [
    CHAPTER_QUIZ_PROMPT,
    '',
    `Source scope: ${sourceScope}. Create questions only from the supplied source text.`
  ].join('\n');

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.6-sol',
    messages: [
      {
        role: 'developer',
        content: [{ type: 'text', text: prompt }]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: cleaned }]
      }
    ]
  });

  const output = response?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = extractJsonObject(output);
  const quiz = normalizeQuiz(parsed, fallbackTitle);
  if (!quiz) {
    throw createHttpError(502, 'Quiz generation returned invalid content');
  }
  return quiz;
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
  const quiz = normalizeQuiz(parsed, `Chapter ${chapterNumber} Quiz`);
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
  const quiz = await generateQuizFromText({
    text: rawText,
    fallbackTitle: `Chapter ${chapterNumber} Quiz`,
    sourceScope: `single book chapter ${chapterNumber}`
  });

  const payload = {
    ...quiz,
    chapterNumber,
    generatedAt: new Date().toISOString(),
    source: 'openai'
  };
  await writeFileAtomic(quizPath, JSON.stringify(payload, null, 2));

  return {
    chapterNumber,
    source: 'openai',
    file: `/data/${bookId}/${quizFilename}`,
    ...quiz
  };
}

export async function loadUnitTopicQuiz({ unitSetId, topicId }) {
  const topic = await loadUnitTopic({ unitSetId, topicId });
  const filename = formatUnitTopicQuizFilename(topic);
  const quizPath = path.join(topic.directory, filename);
  const stat = await safeStat(quizPath);
  if (!stat?.isFile()) {
    throw createHttpError(404, 'Quiz file not found');
  }
  const raw = await fs.readFile(quizPath, 'utf8');
  const parsed = JSON.parse(raw);
  const quiz = normalizeQuiz(parsed, `${topic.title} Quiz`);
  if (!quiz) {
    throw createHttpError(500, 'Quiz file is invalid');
  }
  return {
    unitSetId: topic.unitSetId,
    topicId: topic.topicId,
    source: 'file',
    file: `/data/.units/${topic.unitSetId}/${filename}`,
    ...quiz
  };
}

export async function generateUnitTopicQuiz({ unitSetId, topicId, force = false }) {
  const topic = await loadUnitTopic({ unitSetId, topicId });
  const filename = formatUnitTopicQuizFilename(topic);
  const quizPath = path.join(topic.directory, filename);
  if (!force) {
    const quizStat = await safeStat(quizPath);
    if (quizStat?.isFile()) {
      return loadUnitTopicQuiz({ unitSetId: topic.unitSetId, topicId: topic.topicId });
    }
  }

  const quizText = [
    topic.title,
    topic.summary ? `Summary: ${topic.summary}` : '',
    topic.learningGoal ? `Learning goal: ${topic.learningGoal}` : '',
    topic.content,
    topic.selfCheckQuestions.length > 0
      ? `Self-check questions:\n${topic.selfCheckQuestions.map((question) => `- ${question}`).join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');
  const quiz = await generateQuizFromText({
    text: quizText,
    fallbackTitle: `${topic.title} Quiz`,
    sourceScope: `single study topic "${topic.title}"`
  });

  const payload = {
    ...quiz,
    unitSetId: topic.unitSetId,
    topicId: topic.topicId,
    generatedAt: new Date().toISOString(),
    source: 'openai'
  };
  await writeFileAtomic(quizPath, JSON.stringify(payload, null, 2));

  return {
    unitSetId: topic.unitSetId,
    topicId: topic.topicId,
    source: 'openai',
    file: `/data/.units/${topic.unitSetId}/${filename}`,
    ...quiz
  };
}
