import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBookDirectory, loadBookCard } from './books.js';
import { loadToc } from './toc.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { CHAPTER_NARRATION_PROMPT, CHAPTER_REVIEW_EXTRACT_PROMPT, DATA_DIR } from '../config.js';
import { getOpenAI } from './openai.js';

const CHAPTER_PAD_LENGTH = 3;
const GLOBAL_PROMPTS_PATH = path.join(DATA_DIR, '.chapter-text-prompts.json');

function formatChapterFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.txt`;
}

function formatLegacyNarrationFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.narration.txt`;
}

function formatChapterVersionMetaFilename(chapterNumber) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.text-versions.json`;
}

function formatDerivedVersionFilename(chapterNumber, index) {
  return `chapter${String(chapterNumber).padStart(CHAPTER_PAD_LENGTH, '0')}.text.v${index}.txt`;
}

function getDefaultPromptLibrary() {
  return {
    prompts: [
      {
        id: 'narration-default',
        name: 'Narration',
        template: CHAPTER_NARRATION_PROMPT,
        builtIn: true,
        createdAt: new Date(0).toISOString()
      },
      {
        id: 'review-extract-default',
        name: 'Review Extract',
        template: CHAPTER_REVIEW_EXTRACT_PROMPT,
        builtIn: true,
        createdAt: new Date(0).toISOString()
      }
    ]
  };
}

function normalizePromptEntry(prompt, fallback = {}) {
  const id = typeof prompt?.id === 'string' && prompt.id.trim() ? prompt.id.trim() : fallback.id;
  const name = sanitizePromptName(prompt?.name) || fallback.name || '';
  const template = sanitizeTemplate(prompt?.template) || fallback.template || '';
  if (!id || !name || !template) {
    return null;
  }
  return {
    id,
    name,
    template,
    builtIn: Boolean(fallback.builtIn || prompt?.builtIn),
    createdAt:
      typeof prompt?.createdAt === 'string'
        ? prompt.createdAt
        : typeof fallback.createdAt === 'string'
        ? fallback.createdAt
        : null,
    updatedAt: typeof prompt?.updatedAt === 'string' ? prompt.updatedAt : null
  };
}

function mergePromptLibrary(existing) {
  const defaults = getDefaultPromptLibrary();
  const existingPrompts = Array.isArray(existing?.prompts) ? existing.prompts : [];
  const defaultIds = new Set(defaults.prompts.map((prompt) => prompt.id));
  const mergedDefaults = defaults.prompts.map((defaultPrompt) => {
    const override = existingPrompts.find((prompt) => prompt?.id === defaultPrompt.id);
    return normalizePromptEntry(override || defaultPrompt, defaultPrompt);
  });
  const customPrompts = existingPrompts
    .filter((prompt) => prompt?.id && !defaultIds.has(prompt.id))
    .map((prompt) => normalizePromptEntry(prompt))
    .filter(Boolean);
  return {
    prompts: [...mergedDefaults, ...customPrompts].filter(Boolean)
  };
}

function normalizePromptId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function sanitizePromptName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

function sanitizeTemplate(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function ensurePromptLibrary() {
  const existing = await readJsonFile(GLOBAL_PROMPTS_PATH, null);
  const merged = mergePromptLibrary(existing);
  if (!existing) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeJsonFile(GLOBAL_PROMPTS_PATH, merged);
  }
  return merged;
}

export async function listChapterTextPromptLibrary() {
  return ensurePromptLibrary();
}

export async function addPromptToLibrary({ name, template }) {
  const promptName = sanitizePromptName(name);
  const promptTemplate = sanitizeTemplate(template);
  if (!promptName) {
    throw createHttpError(400, 'Prompt name is required');
  }
  if (!promptTemplate) {
    throw createHttpError(400, 'Prompt text is required');
  }
  const library = await ensurePromptLibrary();
  const baseId = normalizePromptId(promptName) || 'prompt';
  let nextId = baseId;
  let suffix = 2;
  while (library.prompts.some((prompt) => prompt.id === nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const prompt = {
    id: nextId,
    name: promptName,
    template: promptTemplate,
    builtIn: false,
    createdAt: new Date().toISOString()
  };
  const nextLibrary = {
    prompts: [...library.prompts, prompt]
  };
  await writeJsonFile(GLOBAL_PROMPTS_PATH, nextLibrary);
  return { library: nextLibrary, prompt };
}

export async function updatePromptInLibrary({ promptId, name, template }) {
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    throw createHttpError(400, 'Prompt id is required');
  }
  const promptName = sanitizePromptName(name);
  const promptTemplate = sanitizeTemplate(template);
  if (!promptName) {
    throw createHttpError(400, 'Prompt name is required');
  }
  if (!promptTemplate) {
    throw createHttpError(400, 'Prompt text is required');
  }
  const library = await ensurePromptLibrary();
  const current = library.prompts.find((prompt) => prompt.id === id);
  if (!current) {
    throw createHttpError(404, 'Prompt was not found');
  }
  const nextPrompt = {
    ...current,
    name: promptName,
    template: promptTemplate,
    updatedAt: new Date().toISOString()
  };
  const nextLibrary = {
    prompts: library.prompts.map((prompt) => (prompt.id === id ? nextPrompt : prompt))
  };
  await writeJsonFile(GLOBAL_PROMPTS_PATH, nextLibrary);
  return nextLibrary;
}

export async function deletePromptFromLibrary({ promptId }) {
  const id = typeof promptId === 'string' ? promptId.trim() : '';
  if (!id) {
    throw createHttpError(400, 'Prompt id is required');
  }
  const library = await ensurePromptLibrary();
  const current = library.prompts.find((prompt) => prompt.id === id);
  if (!current) {
    throw createHttpError(404, 'Prompt was not found');
  }
  if (current.builtIn) {
    throw createHttpError(400, 'Built-in prompts cannot be deleted');
  }
  const nextLibrary = {
    prompts: library.prompts.filter((prompt) => prompt.id !== id)
  };
  await writeJsonFile(GLOBAL_PROMPTS_PATH, nextLibrary);
  return nextLibrary;
}

async function assertBaseChapter({ bookId, chapterNumber }) {
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
  return { directory, chapterFilename, chapterPath };
}

async function migrateLegacyNarrationVersion({ directory, chapterNumber }) {
  const metaPath = path.join(directory, formatChapterVersionMetaFilename(chapterNumber));
  const metaStat = await safeStat(metaPath);
  if (metaStat?.isFile()) {
    return;
  }
  const legacyFilename = formatLegacyNarrationFilename(chapterNumber);
  const legacyPath = path.join(directory, legacyFilename);
  const legacyStat = await safeStat(legacyPath);
  if (!legacyStat?.isFile()) {
    return;
  }
  const payload = {
    latestVersionId: 'v1',
    versions: [
      {
        id: 'v1',
        index: 1,
        filename: legacyFilename,
        createdAt: legacyStat.mtime.toISOString(),
        promptId: 'narration-default',
        promptName: 'Narration'
      }
    ]
  };
  await writeJsonFile(metaPath, payload);
}

async function loadVersionMeta({ directory, chapterNumber }) {
  await migrateLegacyNarrationVersion({ directory, chapterNumber });
  const metaPath = path.join(directory, formatChapterVersionMetaFilename(chapterNumber));
  const meta = await readJsonFile(metaPath, { latestVersionId: null, versions: [] });
  return {
    metaPath,
    latestVersionId: typeof meta?.latestVersionId === 'string' ? meta.latestVersionId : null,
    versions: Array.isArray(meta?.versions) ? meta.versions : []
  };
}

function buildBaseVersion(chapterFilename) {
  return {
    id: 'base',
    index: 0,
    kind: 'base',
    label: 'Base',
    filename: chapterFilename,
    createdAt: null,
    promptId: null,
    promptName: null,
    deletable: false
  };
}

function buildDerivedVersion(version, bookId) {
  return {
    id: version.id,
    index: version.index,
    kind: 'derived',
    label: `Version ${version.index}`,
    filename: version.filename,
    file: `/data/${bookId}/${version.filename}`,
    createdAt: version.createdAt ?? null,
    promptId: version.promptId ?? null,
    promptName: version.promptName ?? null,
    deletable: true
  };
}

export async function listChapterTextVersions({ bookId, chapterNumber }) {
  const { directory, chapterFilename } = await assertBaseChapter({ bookId, chapterNumber });
  const [{ latestVersionId, versions }, promptLibrary] = await Promise.all([
    loadVersionMeta({ directory, chapterNumber }),
    ensurePromptLibrary()
  ]);
  const derivedVersions = versions
    .filter((version) => version && typeof version.id === 'string' && typeof version.filename === 'string')
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((version) => buildDerivedVersion(version, bookId));
  const baseVersion = {
    ...buildBaseVersion(chapterFilename),
    file: `/data/${bookId}/${chapterFilename}`
  };
  const effectiveVersionId =
    typeof latestVersionId === 'string' && derivedVersions.some((version) => version.id === latestVersionId)
      ? latestVersionId
      : derivedVersions.at(-1)?.id ?? 'base';

  return {
    chapterNumber,
    latestVersionId: effectiveVersionId,
    versions: [baseVersion, ...derivedVersions],
    promptLibrary: promptLibrary.prompts
  };
}

export async function getChapterTextVersionText({ bookId, chapterNumber, versionId = null }) {
  const { directory, chapterFilename, chapterPath } = await assertBaseChapter({ bookId, chapterNumber });
  const { latestVersionId, versions } = await loadVersionMeta({ directory, chapterNumber });
  const resolvedVersionId = versionId || latestVersionId || versions.at(-1)?.id || 'base';
  if (resolvedVersionId === 'base') {
    const text = (await fs.readFile(chapterPath, 'utf8')).trim();
    return {
      versionId: 'base',
      kind: 'base',
      filename: chapterFilename,
      text
    };
  }
  const version = versions.find((entry) => entry?.id === resolvedVersionId);
  if (!version?.filename) {
    throw createHttpError(404, 'Chapter text version not found');
  }
  const versionPath = path.join(directory, version.filename);
  const versionStat = await safeStat(versionPath);
  if (!versionStat?.isFile()) {
    throw createHttpError(404, 'Chapter text version file not found');
  }
  const text = (await fs.readFile(versionPath, 'utf8')).trim();
  return {
    versionId: version.id,
    kind: 'derived',
    filename: version.filename,
    text
  };
}

async function buildPromptInput({ bookId, chapterNumber, chapterText }) {
  const [bookCard, toc] = await Promise.all([
    loadBookCard(bookId),
    loadToc(bookId).catch(() => [])
  ]);
  const tocEntry = Array.isArray(toc) ? toc[chapterNumber - 1] : null;
  return {
    book_title: bookCard.title || bookId,
    chapter_title: typeof tocEntry?.title === 'string' && tocEntry.title.trim() ? tocEntry.title.trim() : `Chapter ${chapterNumber}`,
    chapter_number: String(chapterNumber),
    chapter_text: chapterText,
    title: typeof tocEntry?.title === 'string' && tocEntry.title.trim() ? tocEntry.title.trim() : `Chapter ${chapterNumber}`
  };
}

function applyPromptTemplate(template, placeholders) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, rawKey) => {
    const key = String(rawKey || '').toLowerCase();
    return placeholders[key] ?? '';
  });
}

export async function createChapterTextVersion({
  bookId,
  chapterNumber,
  promptId = null,
  customPrompt = '',
  addToLibrary = false,
  promptName = ''
}) {
  const { directory, chapterFilename, chapterPath } = await assertBaseChapter({ bookId, chapterNumber });
  const chapterText = (await fs.readFile(chapterPath, 'utf8')).trim();
  if (!chapterText) {
    throw createHttpError(400, 'No chapter text available');
  }

  let library = await ensurePromptLibrary();
  let selectedPrompt = null;
  const explicitPrompt = sanitizeTemplate(customPrompt);
  if (promptId) {
    selectedPrompt = library.prompts.find((entry) => entry.id === promptId) ?? null;
    if (!selectedPrompt) {
      throw createHttpError(400, 'Selected prompt was not found');
    }
  }

  if (explicitPrompt && addToLibrary) {
    const saved = await addPromptToLibrary({
      name: promptName || 'Custom prompt',
      template: explicitPrompt
    });
    library = saved.library;
    selectedPrompt = saved.prompt;
  }

  const template = explicitPrompt || selectedPrompt?.template || '';
  if (!template) {
    throw createHttpError(400, 'Prompt text is required');
  }

  const placeholders = await buildPromptInput({ bookId, chapterNumber, chapterText });
  const promptText = applyPromptTemplate(template, placeholders).trim();
  if (!promptText) {
    throw createHttpError(400, 'Prompt resolved to empty text');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      {
        role: 'developer',
        content: [
          {
            type: 'text',
            text: 'Transform the chapter text according to the user prompt. Return only the final rewritten chapter text.'
          }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'text', text: promptText }]
      }
    ]
  });

  const output = response?.choices?.[0]?.message?.content?.trim() || '';
  if (!output) {
    throw createHttpError(502, 'Chapter text version generation returned empty text');
  }

  const meta = await loadVersionMeta({ directory, chapterNumber });
  const maxIndex = meta.versions.reduce((current, entry) => Math.max(current, Number(entry?.index) || 0), 0);
  const nextIndex = maxIndex + 1;
  const nextVersion = {
    id: `v${nextIndex}`,
    index: nextIndex,
    filename: formatDerivedVersionFilename(chapterNumber, nextIndex),
    createdAt: new Date().toISOString(),
    promptId: selectedPrompt?.id ?? null,
    promptName: selectedPrompt?.name ?? sanitizePromptName(promptName) ?? null
  };
  await fs.writeFile(path.join(directory, nextVersion.filename), output, 'utf8');
  await writeJsonFile(meta.metaPath, {
    latestVersionId: nextVersion.id,
    versions: [...meta.versions, nextVersion]
  });

  const versionsPayload = await listChapterTextVersions({ bookId, chapterNumber });
  return {
    ...versionsPayload,
    createdVersionId: nextVersion.id
  };
}

export async function deleteChapterTextVersion({ bookId, chapterNumber, versionId }) {
  if (!versionId || versionId === 'base') {
    throw createHttpError(400, 'Base chapter text cannot be deleted');
  }
  const { directory } = await assertBaseChapter({ bookId, chapterNumber });
  const meta = await loadVersionMeta({ directory, chapterNumber });
  const target = meta.versions.find((entry) => entry?.id === versionId);
  if (!target?.filename) {
    throw createHttpError(404, 'Chapter text version not found');
  }
  const nextVersions = meta.versions.filter((entry) => entry?.id !== versionId);
  await fs.unlink(path.join(directory, target.filename)).catch((error) => {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  });
  await writeJsonFile(meta.metaPath, {
    latestVersionId: nextVersions.at(-1)?.id ?? 'base',
    versions: nextVersions
  });
  return listChapterTextVersions({ bookId, chapterNumber });
}
