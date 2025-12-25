import path from 'node:path';
import fs from 'node:fs/promises';
import {
  DATA_DIR,
  INSIGHTS_PROMPT,
  LLMPROXY_AUTH,
  LLMPROXY_ENDPOINT,
  LLMPROXY_MODEL
} from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { fetchLlmproxy } from './llmproxy.js';
import { resolveDataUrl } from './paths.js';
import { loadPageText } from './ocr.js';

function extractJsonObject(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const snippet = text.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    return null;
  }
}

function normalizeKeyPoints(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function deriveInsightPaths(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const summaryRelative = `${baseName}.summary.txt`;
  const keyPointsRelative = `${baseName}.keypoints.txt`;
  const summaryAbsolute = path.join(DATA_DIR, summaryRelative);
  const keyPointsAbsolute = path.join(DATA_DIR, keyPointsRelative);
  return { summaryRelative, keyPointsRelative, summaryAbsolute, keyPointsAbsolute };
}

async function generateInsightsFromText(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    throw createHttpError(400, 'No text available for insights');
  }

  const response = await fetchLlmproxy(LLMPROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LLMPROXY_AUTH ? { Authorization: `Bearer ${LLMPROXY_AUTH}` } : {})
    },
    body: JSON.stringify({
      model: LLMPROXY_MODEL,
      prompt: `${INSIGHTS_PROMPT}\n\n${trimmed}`,
      stream: false
    })
  });

  if (!response.ok) {
    throw createHttpError(502, `Insights generation failed (${response.status} ${response.statusText})`);
  }

  const payload = await response.json();
  const raw = typeof payload?.response === 'string' ? payload.response.trim() : '';
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw createHttpError(502, 'Unable to generate insights');
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const keyPoints =
    normalizeKeyPoints(parsed.key_points ?? parsed.keyPoints ?? parsed.keypoints);

  if (!summary) {
    throw createHttpError(502, 'Insights missing summary');
  }

  return { summary, keyPoints };
}

export async function loadPageInsights(imageUrl, options = {}) {
  const { skipCache = false } = options;
  const { absolute } = resolveDataUrl(imageUrl);
  const imageStat = await safeStat(absolute);
  if (!imageStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const { summaryAbsolute, keyPointsAbsolute } = deriveInsightPaths(imageUrl);
  const summaryStat = await safeStat(summaryAbsolute);
  const keyPointsStat = await safeStat(keyPointsAbsolute);
  if (summaryStat?.isFile() && keyPointsStat?.isFile() && !skipCache) {
    const summary = await fs.readFile(summaryAbsolute, 'utf8');
    const keyPoints = await fs
      .readFile(keyPointsAbsolute, 'utf8')
      .then((content) => normalizeKeyPoints(content));
    return {
      source: 'file',
      summary: summary.trim(),
      keyPoints
    };
  }

  const pageText = await loadPageText(imageUrl);
  const { summary, keyPoints } = await generateInsightsFromText(pageText.text);

  await fs.mkdir(path.dirname(summaryAbsolute), { recursive: true });
  await fs.writeFile(summaryAbsolute, summary, 'utf8');
  await fs.writeFile(keyPointsAbsolute, keyPoints.join('\n'), 'utf8');

  return {
    source: 'ai',
    summary,
    keyPoints
  };
}
