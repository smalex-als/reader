import fs from 'node:fs/promises';
import path from 'node:path';
import { CHAPTER_UNITS_PROMPT, DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';
import { ensureDataDir } from './fs.js';
import { getOpenAI } from './openai.js';

const UNITS_DIR = path.join(DATA_DIR, '.units');
const UNIT_SET_MANIFEST_FILENAME = 'manifest.json';
const UNIT_SET_PROGRESS_FILENAME = 'progress.json';
const MAX_UNIT_COUNT = 12;

function sanitizeText(value, maxLength = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sanitizeFilenamePart(value) {
  return (
    sanitizeId(value)
      .replace(/-{2,}/g, '-')
      .slice(0, 48) || 'unit'
  );
}

function formatTopicFilename(unit, index) {
  return `${String(index + 1).padStart(2, '0')}-${sanitizeFilenamePart(unit.title || unit.id)}.json`;
}

function formatTopicQuizFilename(topicFilename) {
  return topicFilename.replace(/\.json$/, '.quiz.json');
}

function formatUnitSetDirectoryName(index) {
  return `unit-${String(index).padStart(3, '0')}`;
}

function isUnitTopicFilename(filename) {
  return (
    filename.endsWith('.json') &&
    filename !== UNIT_SET_MANIFEST_FILENAME &&
    filename !== UNIT_SET_PROGRESS_FILENAME &&
    !filename.endsWith('.quiz.json')
  );
}

function normalizeKeyPoints(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeText(item, 240))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeStringList(value, maxItemLength = 300, maxItems = 10) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeText(item, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeUnit(value, index) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const title = sanitizeText(value.title, 160) || `Unit ${index + 1}`;
  const id = sanitizeId(value.id || title) || `unit-${index + 1}`;
  const content = sanitizeText(value.content, 12000) || sanitizeText(value.summary, 2000);
  if (!content) {
    return null;
  }
  return {
    id,
    order:
      Number.isInteger(value.order) && value.order > 0
        ? value.order
        : index + 1,
    title,
    summary: sanitizeText(value.summary, 1200),
    learningGoal: sanitizeText(value.learningGoal, 600),
    content,
    contentFile: typeof value.contentFile === 'string' ? value.contentFile : null,
    keyPoints: normalizeKeyPoints(value.keyPoints),
    selfCheckQuestions: normalizeStringList(value.selfCheckQuestions, 300, 12),
    read: value.read === true,
    hasQuiz: value.hasQuiz === true
  };
}

function normalizeUnitSet(value, fallback = {}) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const now = new Date().toISOString();
  const title =
    sanitizeText(value.title, 180) ||
    sanitizeText(fallback.sourceChapterTitle, 180) ||
    'Untitled unit set';
  const units = Array.isArray(value.units)
    ? value.units.map((unit, index) => normalizeUnit(unit, index)).filter(Boolean).slice(0, MAX_UNIT_COUNT)
    : [];
  if (units.length === 0) {
    return null;
  }
  return {
    id: sanitizeId(value.id) || 'unit',
    title,
    summary: sanitizeText(value.summary, 1600),
    learningGoal: sanitizeText(value.learningGoal, 800),
    sourceBookId: sanitizeText(value.sourceBookId ?? fallback.sourceBookId, 180) || null,
    sourceChapterNumber:
      Number.isInteger(value.sourceChapterNumber) && value.sourceChapterNumber > 0
        ? value.sourceChapterNumber
        : Number.isInteger(fallback.sourceChapterNumber)
        ? fallback.sourceChapterNumber
        : null,
    sourceChapterTitle: sanitizeText(value.sourceChapterTitle ?? fallback.sourceChapterTitle, 180) || null,
    sourceVersionId: sanitizeText(value.sourceVersionId ?? fallback.sourceVersionId, 120) || null,
    source: value.source === 'openai' ? 'openai' : 'fallback',
    createdAt: sanitizeText(value.createdAt, 80) || now,
    updatedAt: sanitizeText(value.updatedAt, 80) || now,
    units
  };
}

function normalizeUnitSetFromFiles(value, fallback = {}) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.files)) {
    return null;
  }
  const manifestFile = value.files.find((file) => {
    if (!file || typeof file !== 'object') {
      return false;
    }
    const filePath = typeof file.path === 'string' ? file.path : '';
    return file.type === 'manifest' || filePath.endsWith('/manifest.json') || filePath === 'manifest.json';
  });
  const manifest = manifestFile?.content && typeof manifestFile.content === 'object' ? manifestFile.content : {};
  const topicFiles = value.files.filter((file) => {
    if (!file || typeof file !== 'object') {
      return false;
    }
    const filePath = typeof file.path === 'string' ? file.path : '';
    const filename = path.basename(filePath);
    return (
      file.type === 'topic' ||
      (filePath.endsWith('.json') &&
        filename !== UNIT_SET_MANIFEST_FILENAME &&
        filename !== UNIT_SET_PROGRESS_FILENAME &&
        !filename.endsWith('.quiz.json'))
    );
  });
  const topicOrder = normalizeStringList(manifest.topicOrder, 120, MAX_UNIT_COUNT);
  const orderRank = new Map(topicOrder.map((id, index) => [sanitizeId(id), index]));
  const units = topicFiles
    .map((file, index) => {
      const unit = normalizeUnit(file.content, index);
      if (!unit) {
        return null;
      }
      const filePath = typeof file.path === 'string' ? path.basename(file.path) : null;
      return {
        ...unit,
        contentFile: filePath
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = orderRank.get(left.id);
      const rightRank = orderRank.get(right.id);
      if (typeof leftRank === 'number' || typeof rightRank === 'number') {
        return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
      }
      return left.order - right.order;
    })
    .slice(0, MAX_UNIT_COUNT);
  return normalizeUnitSet(
    {
      id: manifest.id,
      title: manifest.title,
      summary: manifest.summary,
      learningGoal: manifest.learningGoal,
      source: value.source,
      units
    },
    fallback
  );
}

async function ensureUnitsDirectory() {
  ensureDataDir();
  await fs.mkdir(UNITS_DIR, { recursive: true });
  return UNITS_DIR;
}

async function getNextUnitSetDirectoryName(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const usedNumbers = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const match = entry.name.match(/^unit-(\d+)$/);
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isInteger(value) && value > 0) {
      usedNumbers.add(value);
    }
  }

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }
  return formatUnitSetDirectoryName(nextNumber);
}

function buildManifestForStorage(unitSet) {
  return {
    id: unitSet.id,
    title: unitSet.title,
    summary: unitSet.summary,
    learningGoal: unitSet.learningGoal,
    topicOrder: unitSet.units.map((unit) => unit.id),
    sourceBookId: unitSet.sourceBookId,
    sourceChapterNumber: unitSet.sourceChapterNumber,
    sourceChapterTitle: unitSet.sourceChapterTitle,
    sourceVersionId: unitSet.sourceVersionId,
    source: unitSet.source,
    createdAt: unitSet.createdAt,
    updatedAt: unitSet.updatedAt
  };
}

function normalizeUnitSetProgress(value) {
  if (!value || typeof value !== 'object' || !value.topics || typeof value.topics !== 'object') {
    return { topics: {} };
  }
  const topics = {};
  for (const [rawTopicId, rawTopicProgress] of Object.entries(value.topics)) {
    const topicId = sanitizeId(rawTopicId);
    if (!topicId || !rawTopicProgress || typeof rawTopicProgress !== 'object') {
      continue;
    }
    topics[topicId] = {
      read: rawTopicProgress.read === true,
      updatedAt: sanitizeText(rawTopicProgress.updatedAt, 80) || null
    };
  }
  return { topics };
}

async function readUnitSetProgress(setDirectory) {
  try {
    const raw = await fs.readFile(path.join(setDirectory, UNIT_SET_PROGRESS_FILENAME), 'utf8');
    return normalizeUnitSetProgress(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { topics: {} };
    }
    throw error;
  }
}

async function writeUnitSet(unitSet) {
  const directory = await ensureUnitsDirectory();
  const setDirectoryName = await getNextUnitSetDirectoryName(directory);
  const setDirectory = path.join(directory, setDirectoryName);
  await fs.mkdir(setDirectory, { recursive: true });

  const usedFilenames = new Set();
  const units = [];
  for (let index = 0; index < unitSet.units.length; index += 1) {
    const unit = unitSet.units[index];
    let contentFile = formatTopicFilename(unit, index);
    let suffix = 2;
    while (usedFilenames.has(contentFile) || contentFile === UNIT_SET_MANIFEST_FILENAME) {
      contentFile = contentFile.replace(/\.md$/, `-${suffix}.md`);
      contentFile = contentFile.replace(/\.json$/, `-${suffix}.json`);
      suffix += 1;
    }
    usedFilenames.add(contentFile);
    const storedUnit = { ...unit, order: index + 1, contentFile };
    await fs.writeFile(
      path.join(setDirectory, contentFile),
      JSON.stringify(
        {
          id: storedUnit.id,
          order: storedUnit.order,
          title: storedUnit.title,
          summary: storedUnit.summary,
          learningGoal: storedUnit.learningGoal,
          content: storedUnit.content,
          keyPoints: storedUnit.keyPoints,
          selfCheckQuestions: storedUnit.selfCheckQuestions
        },
        null,
        2
      ),
      'utf8'
    );
    units.push(storedUnit);
  }

  const stored = { ...unitSet, id: setDirectoryName, units };
  await fs.writeFile(
    path.join(setDirectory, UNIT_SET_MANIFEST_FILENAME),
    JSON.stringify(buildManifestForStorage(stored), null, 2),
    'utf8'
  );
  return stored;
}

async function readUnitSetFromDirectory(entryName) {
  const setDirectory = path.join(UNITS_DIR, entryName);
  let manifest = null;
  try {
    const raw = await fs.readFile(path.join(setDirectory, UNIT_SET_MANIFEST_FILENAME), 'utf8');
    manifest = JSON.parse(raw);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }
  const entries = await fs.readdir(setDirectory, { withFileTypes: true });
  const filenames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const progress = await readUnitSetProgress(setDirectory);
  const topicOrder = normalizeStringList(manifest.topicOrder, 120, MAX_UNIT_COUNT);
  const orderRank = new Map(topicOrder.map((id, index) => [sanitizeId(id), index]));
  const units = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && isUnitTopicFilename(entry.name)
      )
      .map(async (entry, index) => {
        try {
          const raw = await fs.readFile(path.join(setDirectory, entry.name), 'utf8');
          const parsed = JSON.parse(raw);
          const unitId = sanitizeId(parsed?.id);
          return normalizeUnit(
            {
              ...parsed,
              contentFile: entry.name,
              read: progress.topics[unitId]?.read === true,
              hasQuiz: filenames.has(formatTopicQuizFilename(entry.name))
            },
            index
          );
        } catch (error) {
          if (error?.code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      })
  );
  const sortedUnits = units
    .filter(Boolean)
    .sort((left, right) => {
      const leftRank = orderRank.get(left.id);
      const rightRank = orderRank.get(right.id);
      if (typeof leftRank === 'number' || typeof rightRank === 'number') {
        return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
      }
      return left.order - right.order;
    });
  return normalizeUnitSet({ ...manifest, id: entryName, units: sortedUnits });
}

async function readUnitSetsFromDirectories() {
  await ensureUnitsDirectory();
  const entries = await fs.readdir(UNITS_DIR, { withFileTypes: true });
  const items = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readUnitSetFromDirectory(entry.name))
  );
  return items.filter(Boolean);
}

function splitByHeadings(content) {
  const lines = content.replace(/\r/g, '').split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      if (current?.content.trim()) {
        sections.push(current);
      }
      current = {
        title: heading[2].trim(),
        content: ''
      };
      continue;
    }
    if (!current) {
      current = { title: 'Introduction', content: '' };
    }
    current.content += `${line}\n`;
  }

  if (current?.content.trim()) {
    sections.push(current);
  }
  return sections;
}

function splitByParagraphs(content) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const targetWords = 650;
  const sections = [];
  let buffer = [];
  let wordCount = 0;

  for (const paragraph of paragraphs) {
    buffer.push(paragraph);
    wordCount += paragraph.split(/\s+/).filter(Boolean).length;
    if (wordCount >= targetWords && sections.length < MAX_UNIT_COUNT - 1) {
      sections.push({
        title: `Unit ${sections.length + 1}`,
        content: buffer.join('\n\n')
      });
      buffer = [];
      wordCount = 0;
    }
  }
  if (buffer.length > 0) {
    sections.push({
      title: `Unit ${sections.length + 1}`,
      content: buffer.join('\n\n')
    });
  }
  return sections;
}

function summarize(text, maxLength = 360) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength).replace(/\s+\S*$/, '')}...`;
}

function createFallbackUnits({ content, sourceChapterTitle, sourceBookId, sourceChapterNumber, sourceVersionId }) {
  const sectionsFromHeadings = splitByHeadings(content).filter((section) => section.content.trim().length > 160);
  const sections = sectionsFromHeadings.length >= 2 ? sectionsFromHeadings : splitByParagraphs(content);
  const units = sections.slice(0, MAX_UNIT_COUNT).map((section, index) => ({
    id: `unit-${index + 1}`,
    order: index + 1,
    title: sanitizeText(section.title, 140) || `Unit ${index + 1}`,
    summary: summarize(section.content),
    learningGoal: `Understand the core ideas in ${sanitizeText(section.title, 140) || `unit ${index + 1}`}.`,
    content: section.content.trim(),
    keyPoints: section.content
      .split(/\n+/)
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter((line) => line.length >= 24 && line.length <= 220)
      .slice(0, 5),
    selfCheckQuestions: []
  }));

  return normalizeUnitSet(
    {
      title: sourceChapterTitle || 'Untitled unit set',
      summary: summarize(content, 700),
      source: 'fallback',
      units
    },
    { sourceBookId, sourceChapterNumber, sourceChapterTitle, sourceVersionId }
  );
}

function extractJsonObject(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function adaptWithOpenAI({ content, sourceChapterTitle, sourceBookId, sourceChapterNumber, sourceVersionId }) {
  const openai = getOpenAI();
  const promptText = CHAPTER_UNITS_PROMPT.replace('PASTE CHAPTER CONTENT HERE', content);
  const response = await openai.responses.create({
    model: 'gpt-5.5',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: promptText
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              sourceBookId,
              sourceChapterNumber,
              sourceChapterTitle,
              sourceVersionId,
              chapterText: content
            })
          }
        ]
      }
    ]
  });
  const parsed = extractJsonObject(response.output_text);
  const fallback = { sourceBookId, sourceChapterNumber, sourceChapterTitle, sourceVersionId };
  return (
    normalizeUnitSetFromFiles({ ...parsed, source: 'openai' }, fallback) ??
    normalizeUnitSet(
      {
        ...parsed,
        source: 'openai'
      },
      fallback
    )
  );
}

export async function listUnits() {
  const items = (await readUnitSetsFromDirectories()).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
  return { items };
}

export async function loadUnitTopic({ unitSetId, topicId }) {
  await ensureUnitsDirectory();
  const setDirectoryName = sanitizeId(unitSetId);
  const topicIdValue = sanitizeId(topicId);
  if (!setDirectoryName || !topicIdValue) {
    throw createHttpError(400, 'Valid unit and topic ids are required');
  }
  const setDirectory = path.join(UNITS_DIR, setDirectoryName);
  const entries = await fs.readdir(setDirectory, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw createHttpError(404, 'Unit not found');
    }
    throw error;
  });

  for (const entry of entries) {
    if (!entry.isFile() || !isUnitTopicFilename(entry.name)) {
      continue;
    }
    const raw = await fs.readFile(path.join(setDirectory, entry.name), 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeUnit({ ...parsed, contentFile: entry.name }, 0);
    if (!normalized || normalized.id !== topicIdValue) {
      continue;
    }
    return {
      unitSetId: setDirectoryName,
      topicId: topicIdValue,
      directory: setDirectory,
      ...normalized
    };
  }

  throw createHttpError(404, 'Topic not found');
}

export async function updateUnitTopicRead({ unitSetId, topicId, read }) {
  const directory = await ensureUnitsDirectory();
  const setDirectoryName = sanitizeId(unitSetId);
  const topicIdValue = sanitizeId(topicId);
  if (!setDirectoryName || !topicIdValue) {
    throw createHttpError(400, 'Valid unit and topic ids are required');
  }
  const setDirectory = path.join(directory, setDirectoryName);
  const entries = await fs.readdir(setDirectory, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw createHttpError(404, 'Unit not found');
    }
    throw error;
  });

  let topicFound = false;
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !isUnitTopicFilename(entry.name)
    ) {
      continue;
    }
    const topicPath = path.join(setDirectory, entry.name);
    const raw = await fs.readFile(topicPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (sanitizeId(parsed?.id) !== topicIdValue) {
      continue;
    }
    topicFound = true;
    break;
  }

  if (!topicFound) {
    throw createHttpError(404, 'Topic not found');
  }

  const progress = await readUnitSetProgress(setDirectory);
  const updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(setDirectory, UNIT_SET_PROGRESS_FILENAME),
    JSON.stringify(
      {
        ...progress,
        topics: {
          ...progress.topics,
          [topicIdValue]: {
            read: read === true,
            updatedAt
          }
        },
        updatedAt
      },
      null,
      2
    ),
    'utf8'
  );

  const item = await readUnitSetFromDirectory(setDirectoryName);
  if (!item) {
    throw createHttpError(404, 'Unit not found');
  }
  return item;
}

export async function createUnitsFromChapter({
  sourceBookId,
  sourceChapterNumber,
  sourceChapterTitle,
  sourceVersionId,
  content
}) {
  const chapterText = sanitizeText(content, 180000);
  if (!chapterText) {
    throw createHttpError(400, 'Chapter content is required');
  }
  const fallback = {
    sourceBookId: sanitizeText(sourceBookId, 180) || null,
    sourceChapterNumber,
    sourceChapterTitle: sanitizeText(sourceChapterTitle, 180) || null,
    sourceVersionId: sanitizeText(sourceVersionId, 120) || null
  };

  let unitSet = null;
  try {
    unitSet = await adaptWithOpenAI({ ...fallback, content: chapterText });
  } catch (error) {
    console.warn('Unit adaptation failed; using local fallback', error);
  }
  if (!unitSet) {
    unitSet = createFallbackUnits({ ...fallback, content: chapterText });
  }
  if (!unitSet) {
    throw createHttpError(500, 'Unable to create units from this chapter');
  }

  const now = new Date().toISOString();
  const stored = await writeUnitSet({
    ...unitSet,
    createdAt: now,
    updatedAt: now
  });
  return stored;
}
