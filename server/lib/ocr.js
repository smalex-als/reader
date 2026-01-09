import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import {
  DATA_DIR,
  LLMPROXY_AUTH,
  LLMPROXY_ENDPOINT,
  LLMPROXY_MODEL,
  OCR_BACKEND,
  OCR_OPENAI_MODEL,
  getTextPrompt
} from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { fetchLlmproxy } from './llmproxy.js';
import { deriveTextPathsFromImageUrl, resolveDataUrl } from './paths.js';
import { getOcrOpenAI, getOpenAI } from './openai.js';

async function extractTextFromLlmproxy(absolute, prompt) {
  const buffer = await fs.readFile(absolute);
  const base64 = buffer.toString('base64');

  const response = await fetchLlmproxy(LLMPROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLMPROXY_AUTH}`
    },
    body: JSON.stringify({
      model: LLMPROXY_MODEL,
      prompt,
      images: [base64],
      stream: false
    })
  });

  if (!response.ok) {
    throw createHttpError(502, `LLM proxy failed (${response.status} ${response.statusText})`);
  }

  const payload = await response.json();
  const rawText = typeof payload?.response === 'string' ? payload.response : '';
  let text = rawText.trim();
  if (!text) {
    throw createHttpError(502, 'LLM proxy returned empty text');
  }

  return text;
}

export async function loadPageText(imageUrl, options = {}) {
  const { skipCache = false } = options;
  const { absolute } = resolveDataUrl(imageUrl);
  const { textRelative, textAbsolute } = deriveTextPathsFromImageUrl(imageUrl);

  const textStat = await safeStat(textAbsolute);
  if (textStat?.isFile() && !skipCache) {
    const textContent = await fs.readFile(textAbsolute, 'utf8');
    return {
      source: 'file',
      text: textContent,
      url: `/data/${textRelative}`,
      absolutePath: textAbsolute
    };
  }

  const imageStat = await safeStat(absolute);
  if (!imageStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const mimeType = mime.lookup(absolute);
  if (!mimeType) {
    throw createHttpError(400, 'Unsupported image type');
  }

  let text = '';
  const prompt = getTextPrompt({
    backend: OCR_BACKEND,
    model:
      OCR_BACKEND === 'llmproxy'
        ? LLMPROXY_MODEL
        : OCR_BACKEND === 'openai'
          ? 'gpt-5.2'
          : OCR_OPENAI_MODEL
  });

  if (OCR_BACKEND === 'llmproxy') {
    text = await extractTextFromLlmproxy(absolute, prompt);
  } else if (OCR_BACKEND === 'openai') {
    const openai = getOpenAI();
    const buffer = await fs.readFile(absolute);
    const base64 = buffer.toString('base64');

    const response = await openai.responses.create({
      model: 'gpt-5.2',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: prompt
            },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64}`
            }
          ]
        }
      ]
    });

    text =
      response.output_text?.trim() ||
      response?.output?.[0]?.content?.[0]?.text?.trim() ||
      '';
  } else if (OCR_BACKEND === 'openai_compat') {
    const openai = getOcrOpenAI();
    const buffer = await fs.readFile(absolute);
    const base64 = buffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: OCR_OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` }
            }
          ]
        }
      ]
    });

    text = response?.choices?.[0]?.message?.content?.trim() || '';
  } else {
    throw createHttpError(500, `Unknown OCR backend: ${OCR_BACKEND}`);
  }

  if (!text) {
    throw createHttpError(502, 'Failed to generate text');
  }

  await fs.mkdir(path.dirname(textAbsolute), { recursive: true });
  await fs.writeFile(textAbsolute, text, 'utf8');

  return {
    source: 'ai',
    text,
    url: `/data/${textRelative}`,
    absolutePath: textAbsolute
  };
}

export async function savePageText(imageUrl, text) {
  if (typeof text !== 'string') {
    throw createHttpError(400, 'Text content is required');
  }
  const { absolute } = resolveDataUrl(imageUrl);
  const { textRelative, textAbsolute } = deriveTextPathsFromImageUrl(imageUrl);

  const imageStat = await safeStat(absolute);
  if (!imageStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  await fs.mkdir(path.dirname(textAbsolute), { recursive: true });
  await fs.writeFile(textAbsolute, text, 'utf8');

  return {
    source: 'file',
    text,
    url: `/data/${textRelative}`,
    absolutePath: textAbsolute
  };
}
