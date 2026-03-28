import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import {
  DATA_DIR,
  OCR_DEEPSEEK_HOST,
  OCR_DEEPSEEK_MODEL,
  OCR_DEEPSEEK_PROMPT,
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

function normalizeOcrEngine(engine) {
  if (engine === 'deepseek_ocr') {
    return engine;
  } else if (engine === 'openai_compat') {
    return engine;
  }
  return 'deepseek_ocr';
}

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

async function extractTextFromDeepseekOcr(absolute) {
  const buffer = await fs.readFile(absolute);
  const requestBody = JSON.stringify({
    model: OCR_DEEPSEEK_MODEL,
    prompt: OCR_DEEPSEEK_PROMPT,
    images: [buffer.toString('base64')],
    stream: false
  });

  let lastStatus = 500;
  let lastErrorText = 'Unknown Deepseek OCR error';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${OCR_DEEPSEEK_HOST}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: requestBody
    });

    if (response.ok) {
      const payload = await response.json();
      const text = typeof payload?.response === 'string' ? payload.response.trim() : '';
      if (!text) {
        throw createHttpError(502, 'Deepseek OCR returned empty text');
      }
      return text;
    }

    lastStatus = response.status;
    lastErrorText = await response.text();
    const isTransientLoadFailure =
      response.status >= 500 &&
      /do load request|\/load|EOF/i.test(lastErrorText);
    if (!isTransientLoadFailure || attempt === 2) {
      break;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1200 * (attempt + 1));
    });
  }

  throw createHttpError(502, `Deepseek OCR failed (${lastStatus} ${lastErrorText})`);
}

export async function loadPageText(imageUrl, options = {}) {
  const { skipCache = false, engine = null } = options;
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
  const normalizedEngine = normalizeOcrEngine(engine);
  if (normalizedEngine === 'deepseek_ocr') {
    text = await extractTextFromDeepseekOcr(absolute);
  } else {
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
