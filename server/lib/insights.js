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

function parsePlainInsights(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { summary: '', keyPoints: [] };
  }
  const cleaned = text.trim();
  const normalized = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  return { summary: normalized.trim() };
}

function deriveInsightPaths(imageUrl) {
  const { relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const summaryRelative = `${baseName}.summary.txt`;
  const summaryAbsolute = path.join(DATA_DIR, summaryRelative);
  return { summaryRelative, summaryAbsolute };
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
  // eslint-disable-next-line no-console
  console.log('Insights LLM response', payload);
  const rawResponse = payload?.response;
  const raw = typeof rawResponse === 'string' ? rawResponse.trim() : '';
  const { summary, keyPoints } = parsePlainInsights(raw);

  if (!summary) {
    throw createHttpError(502, 'Unable to generate insights');
  }

  return { summary };
}

export async function loadPageInsights(imageUrl, options = {}) {
  const { skipCache = false } = options;
  const { absolute } = resolveDataUrl(imageUrl);
  const imageStat = await safeStat(absolute);
  if (!imageStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const { summaryAbsolute } = deriveInsightPaths(imageUrl);
  const summaryStat = await safeStat(summaryAbsolute);
  if (summaryStat?.isFile() && !skipCache) {
    const summary = await fs.readFile(summaryAbsolute, 'utf8');
    return {
      source: 'file',
      summary: summary.trim()
    };
  }

  const pageText = await loadPageText(imageUrl);
  const { summary } = await generateInsightsFromText(pageText.text);

  await fs.mkdir(path.dirname(summaryAbsolute), { recursive: true });
  await fs.writeFile(summaryAbsolute, summary, 'utf8');

  return {
    source: 'ai',
    summary
  };
}
