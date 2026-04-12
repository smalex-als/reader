import fs from 'node:fs/promises';
import path from 'node:path';
import { SEARCH_INDEX_FILENAME } from '../config.js';
import { assertBookDirectory, getBookType, loadManifest } from './books.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { extractPlainTextFromOcrLayout } from './ocrLayout.js';
import { deriveTextPathsFromImageUrl, resolveDataUrl } from './paths.js';
import { loadToc } from './toc.js';

const WORD_PATTERN = /[a-z0-9]+(?:['’-][a-z0-9]+)*/g;
const SNIPPET_CONTEXT_CHARS = 100;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

function clampLimit(rawLimit) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

export function tokenizeSearchText(text) {
  const input = String(text || '').toLowerCase();
  const tokens = [];
  for (const match of input.matchAll(WORD_PATTERN)) {
    const value = match[0]?.trim();
    if (!value) {
      continue;
    }
    tokens.push({
      term: value,
      start: match.index ?? 0,
      end: (match.index ?? 0) + value.length
    });
  }
  return tokens;
}

function dedupeTerms(tokens) {
  return [...new Set(tokens.map((token) => token.term))];
}

function createSnippet(text, queryTerms) {
  const input = String(text || '').replace(/\s+/g, ' ').trim();
  if (!input) {
    return '';
  }

  const lower = input.toLowerCase();
  let bestIndex = -1;
  for (const term of queryTerms) {
    const nextIndex = lower.indexOf(term.toLowerCase());
    if (nextIndex !== -1 && (bestIndex === -1 || nextIndex < bestIndex)) {
      bestIndex = nextIndex;
    }
  }

  if (bestIndex === -1) {
    return input.slice(0, SNIPPET_CONTEXT_CHARS * 2).trim();
  }

  const start = Math.max(0, bestIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(input.length, bestIndex + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < input.length ? '...' : '';
  return `${prefix}${input.slice(start, end).trim()}${suffix}`;
}

function getCurrentSectionTitle(toc, pageIndex) {
  let activeTitle = '';
  for (const entry of toc) {
    if (!Number.isInteger(entry?.page) || entry.page > pageIndex) {
      break;
    }
    activeTitle = entry.title || activeTitle;
  }
  return activeTitle;
}

function createImageDocument(imageUrl, pageIndex, plainText, toc) {
  const { textRelative } = deriveTextPathsFromImageUrl(imageUrl);
  return {
    id: `page:${pageIndex}`,
    kind: 'page',
    page: pageIndex,
    chapterNumber: null,
    title: getCurrentSectionTitle(toc, pageIndex),
    textPath: path.basename(textRelative),
    wordCount: tokenizeSearchText(plainText).length
  };
}

function createTextDocument(bookId, chapterNumber, chapterIndex, plainText, toc) {
  return {
    id: `chapter:${chapterNumber}`,
    kind: 'chapter',
    page: chapterIndex,
    chapterNumber,
    title: getCurrentSectionTitle(toc, chapterIndex) || `Chapter ${chapterNumber}`,
    textPath: `chapter${String(chapterNumber).padStart(3, '0')}.txt`,
    wordCount: tokenizeSearchText(plainText).length
  };
}

async function buildImageBookDocuments(bookId, toc) {
  const manifest = await loadManifest(bookId);
  const documents = [];
  for (let pageIndex = 0; pageIndex < manifest.length; pageIndex += 1) {
    const imageUrl = manifest[pageIndex];
    const { textAbsolute } = deriveTextPathsFromImageUrl(imageUrl);
    const stat = await safeStat(textAbsolute);
    if (!stat?.isFile()) {
      continue;
    }
    const rawText = await fs.readFile(textAbsolute, 'utf8');
    const plainText = extractPlainTextFromOcrLayout(rawText).trim();
    if (!plainText) {
      continue;
    }
    documents.push({
      document: createImageDocument(imageUrl, pageIndex, plainText, toc),
      plainText
    });
  }
  return documents;
}

async function buildTextBookDocuments(bookId, toc) {
  const directory = await assertBookDirectory(bookId);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const chapterFiles = entries
    .filter((entry) => entry.isFile() && /^chapter\d+\.txt$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const documents = [];
  for (const entry of chapterFiles) {
    const match = entry.name.match(/^chapter(\d+)\.txt$/i);
    if (!match) {
      continue;
    }
    const chapterNumber = Number.parseInt(match[1], 10);
    const chapterIndex = chapterNumber - 1;
    const plainText = (await fs.readFile(path.join(directory, entry.name), 'utf8')).trim();
    if (!plainText) {
      continue;
    }
    documents.push({
      document: createTextDocument(bookId, chapterNumber, chapterIndex, plainText, toc),
      plainText
    });
  }
  return documents;
}

function addPosting(terms, term, docId, tokenIndex) {
  const postings = terms[term] ?? (terms[term] = []);
  const existing = postings[postings.length - 1];
  if (existing && existing.docId === docId) {
    existing.count += 1;
    existing.positions.push(tokenIndex);
    return;
  }
  postings.push({ docId, count: 1, positions: [tokenIndex] });
}

export async function buildBookSearchIndex(bookId) {
  const directory = await assertBookDirectory(bookId);
  const bookType = await getBookType(bookId);
  const toc = await loadToc(bookId);
  const sourceDocuments =
    bookType === 'text'
      ? await buildTextBookDocuments(bookId, toc)
      : await buildImageBookDocuments(bookId, toc);

  const documents = [];
  const terms = {};
  for (const { document, plainText } of sourceDocuments) {
    const tokens = tokenizeSearchText(plainText);
    if (tokens.length === 0) {
      continue;
    }
    const docId = document.id;
    documents.push(document);
    tokens.forEach((token, index) => {
      addPosting(terms, token.term, docId, index);
    });
  }

  const index = {
    version: 1,
    book: bookId,
    bookType,
    builtAt: new Date().toISOString(),
    documents,
    terms
  };

  await fs.writeFile(path.join(directory, SEARCH_INDEX_FILENAME), JSON.stringify(index, null, 2), 'utf8');
  return index;
}

export async function invalidateBookSearchIndex(bookId) {
  const directory = await assertBookDirectory(bookId);
  await fs.rm(path.join(directory, SEARCH_INDEX_FILENAME), { force: true });
}

export async function invalidateSearchIndexForImage(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const [bookId] = relative.split('/');
  if (!bookId) {
    return;
  }
  await fs.rm(path.join(await assertBookDirectory(bookId), SEARCH_INDEX_FILENAME), { force: true });
}

export async function loadBookSearchIndex(bookId, options = {}) {
  const directory = await assertBookDirectory(bookId);
  const filePath = path.join(directory, SEARCH_INDEX_FILENAME);
  const stat = await safeStat(filePath);
  if (!stat?.isFile()) {
    if (options.autoBuild) {
      return buildBookSearchIndex(bookId);
    }
    throw createHttpError(404, 'Search index not found');
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.documents) || !parsed.terms) {
    throw createHttpError(500, 'Search index is invalid');
  }
  return parsed;
}

async function loadDocumentText(directory, document) {
  const absolutePath = path.join(directory, document.textPath);
  const stat = await safeStat(absolutePath);
  if (!stat?.isFile()) {
    return '';
  }
  const text = await fs.readFile(absolutePath, 'utf8');
  return document.kind === 'page' ? extractPlainTextFromOcrLayout(text) : text;
}

function hasPhraseMatch(index, documentId, queryTokens) {
  if (queryTokens.length < 2) {
    return false;
  }
  const positionSets = queryTokens.map((token) => {
    const posting = (index.terms[token.term] || []).find((entry) => entry.docId === documentId);
    return posting ? new Set(posting.positions) : null;
  });
  if (positionSets.some((value) => !value)) {
    return false;
  }
  const firstPositions = positionSets[0];
  for (const position of firstPositions) {
    let matched = true;
    for (let offset = 1; offset < positionSets.length; offset += 1) {
      if (!positionSets[offset].has(position + offset)) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
}

export async function searchBook(bookId, rawQuery, options = {}) {
  const query = String(rawQuery || '').trim();
  if (!query) {
    throw createHttpError(400, 'Search query is required');
  }

  const queryTokens = tokenizeSearchText(query);
  if (queryTokens.length === 0) {
    throw createHttpError(400, 'Search query must include letters or numbers');
  }

  const limit = clampLimit(options.limit);
  const index = await loadBookSearchIndex(bookId, { autoBuild: options.autoBuild !== false });
  const docMap = new Map(index.documents.map((document) => [document.id, document]));
  const scores = new Map();
  const matchedTerms = new Map();

  for (const term of dedupeTerms(queryTokens)) {
    const postings = index.terms[term] || [];
    for (const posting of postings) {
      if (!docMap.has(posting.docId)) {
        continue;
      }
      scores.set(posting.docId, (scores.get(posting.docId) || 0) + posting.count);
      const termsForDoc = matchedTerms.get(posting.docId) ?? new Set();
      termsForDoc.add(term);
      matchedTerms.set(posting.docId, termsForDoc);
    }
  }

  const ranked = [...scores.entries()]
    .map(([docId, baseScore]) => {
      const document = docMap.get(docId);
      if (!document) {
        return null;
      }
      const matchedCount = matchedTerms.get(docId)?.size || 0;
      const title = String(document.title || '').toLowerCase();
      const titleBoost = dedupeTerms(queryTokens).some((term) => title.includes(term)) ? 2 : 0;
      const phraseBoost = hasPhraseMatch(index, docId, queryTokens) ? 3 : 0;
      return {
        document,
        score: baseScore + matchedCount * 2 + titleBoost + phraseBoost
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (a.document.page ?? 0) - (b.document.page ?? 0);
    })
    .slice(0, limit);

  const directory = await assertBookDirectory(bookId);
  const results = [];
  for (const entry of ranked) {
    const text = await loadDocumentText(directory, entry.document);
    results.push({
      id: entry.document.id,
      kind: entry.document.kind,
      page: entry.document.page,
      chapterNumber: entry.document.chapterNumber,
      title: entry.document.title,
      score: entry.score,
      textPath: `/data/${bookId}/${entry.document.textPath}`,
      snippet: createSnippet(text, dedupeTerms(queryTokens))
    });
  }

  return {
    book: bookId,
    query,
    count: results.length,
    builtAt: index.builtAt,
    results
  };
}
