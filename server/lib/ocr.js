import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import {
  getTextPrompt,
  OCR_BACKEND,
  OCR_TIMEOUT_MS,
  OCR_DEEPSEEK_HOST,
  OCR_DEEPSEEK_CONCURRENCY,
  OCR_DEEPSEEK_MODEL,
  OCR_DEEPSEEK_PATH,
  OCR_DEEPSEEK_PROMPT
} from '../config.js';
import {createHttpError} from './errors.js';
import {safeStat} from './fs.js';
import {deriveTextPathsFromImageUrl, resolveDataUrl} from './paths.js';
import {getOpenAI} from './openai.js';

function resolveOcrBackend(engine) {
  if (engine === 'openai' || engine === 'deepseek_ocr') {
    return engine;
  }
  return OCR_BACKEND;
}

function resolveDeepseekOcrUrl() {
  return new URL(OCR_DEEPSEEK_PATH, OCR_DEEPSEEK_HOST).toString();
}

function createOcrTimeoutError(timeoutMs) {
  const error = new Error(`OCR timed out after ${timeoutMs}ms`);
  error.code = 'OCR_TIMEOUT';
  return error;
}

let activeDeepseekOcrRequests = 0;
const deepseekOcrQueue = [];

function grantDeepseekOcrSlots() {
  while (
    activeDeepseekOcrRequests < OCR_DEEPSEEK_CONCURRENCY &&
    deepseekOcrQueue.length > 0
  ) {
    activeDeepseekOcrRequests += 1;
    const resolve = deepseekOcrQueue.shift();
    resolve?.();
  }
}

async function acquireDeepseekOcrSlot() {
  if (activeDeepseekOcrRequests < OCR_DEEPSEEK_CONCURRENCY) {
    activeDeepseekOcrRequests += 1;
    return;
  }
  await new Promise((resolve) => {
    deepseekOcrQueue.push(resolve);
  });
}

function releaseDeepseekOcrSlot() {
  activeDeepseekOcrRequests = Math.max(0, activeDeepseekOcrRequests - 1);
  grantDeepseekOcrSlots();
}

async function runWithDeepseekOcrSlot(task) {
  await acquireDeepseekOcrSlot();
  try {
    return await task();
  } finally {
    releaseDeepseekOcrSlot();
  }
}

async function withOcrTimeout(task, timeoutMs) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createOcrTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function writeEmptyPageText(textAbsolute) {
  await fs.mkdir(path.dirname(textAbsolute), { recursive: true });
  await fs.writeFile(textAbsolute, '', 'utf8');
}

async function extractTextFromDeepseekOcr(absolute, timeoutMs) {
  const buffer = await fs.readFile(absolute);
  const requestBody = JSON.stringify({
    model: OCR_DEEPSEEK_MODEL,
    prompt: OCR_DEEPSEEK_PROMPT,
    images: [buffer.toString('base64')],
    stream: false
  });

  let lastStatus = 500;
  let lastErrorText = 'Unknown Deepseek OCR error';
  const requestUrl = resolveDeepseekOcrUrl();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const abortId = setTimeout(() => controller.abort(createOcrTimeoutError(timeoutMs)), timeoutMs);
    let response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: requestBody,
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(abortId);
      if (error?.name === 'AbortError' || error?.code === 'OCR_TIMEOUT') {
        throw createOcrTimeoutError(timeoutMs);
      }
      throw error;
    }
    clearTimeout(abortId);

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
  const timeoutMs = Number.isFinite(OCR_TIMEOUT_MS) && OCR_TIMEOUT_MS > 0 ? OCR_TIMEOUT_MS : 20000;

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
  const ocrBackend = resolveOcrBackend(engine);
  try {
    if (ocrBackend === 'deepseek_ocr') {
      text = await runWithDeepseekOcrSlot(() => extractTextFromDeepseekOcr(absolute, timeoutMs));
    } else if (ocrBackend === 'openai') {
      const prompt = getTextPrompt({
        backend: ocrBackend,
        model: 'gpt-5.5'
      });

      const openai = getOpenAI();
      const buffer = await fs.readFile(absolute);
      const base64 = buffer.toString('base64');

      const response = await withOcrTimeout(
        () =>
          openai.responses.create({
            model: 'gpt-5.5',
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
          }),
        timeoutMs
      );

      text =
        response.output_text?.trim() ||
        response?.output?.[0]?.content?.[0]?.text?.trim() ||
        '';
    } else {
      throw createHttpError(500, `Unknown OCR backend: ${ocrBackend}`);
    }
  } catch (error) {
    if (error?.code === 'OCR_TIMEOUT' || error?.name === 'AbortError') {
      await writeEmptyPageText(textAbsolute);
      return {
        source: 'file',
        text: '',
        url: `/data/${textRelative}`,
        absolutePath: textAbsolute
      };
    }
    throw error;
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
