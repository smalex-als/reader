import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import { execFile } from 'node:child_process/promises';
import { fileURLToPath } from 'node:url';
import {
  getTextPrompt,
  OCR_BACKEND,
  OCR_DEEPSEEK_API_STYLE,
  OCR_DEEPSEEK_HOST,
  OCR_DEEPSEEK_DEBUG,
  OCR_DEEPSEEK_MODEL,
  OCR_DEEPSEEK_OPENAI_API_KEY,
  OCR_DEEPSEEK_OPENAI_BASE_URL,
  OCR_DEEPSEEK_OPENAI_EXTRA_BODY,
  OCR_DEEPSEEK_OPENAI_MAX_TOKENS,
  OCR_DEEPSEEK_OPENAI_MODEL,
  OCR_DEEPSEEK_PATH,
  OCR_DEEPSEEK_PROMPT
} from '../config.js';
import {createHttpError} from './errors.js';
import {safeStat} from './fs.js';
import {deriveTextPathsFromImageUrl, resolveDataUrl} from './paths.js';
import {getOpenAI} from './openai.js';

function normalizeOcrEngine(engine) {
  if (engine === 'openai') {
    return engine;
  }
  return 'deepseek_ocr';
}

function resolveDeepseekOcrUrl() {
  return new URL(OCR_DEEPSEEK_PATH, OCR_DEEPSEEK_HOST).toString();
}

function resolveDeepseekOpenAiChatCompletionsUrl() {
  const normalizedBase = OCR_DEEPSEEK_OPENAI_BASE_URL.endsWith('/')
    ? OCR_DEEPSEEK_OPENAI_BASE_URL
    : `${OCR_DEEPSEEK_OPENAI_BASE_URL}/`;
  return new URL('chat/completions', normalizedBase).toString();
}

const DEEPSEEK_OCR_PYTHON_HELPER = fileURLToPath(
  new URL('../scripts/deepseek_ocr_openai.py', import.meta.url)
);
const OCR_PYTHON_BIN = process.env.OCR_PYTHON_BIN || 'python3';

function parseDeepseekOpenAiExtraBody() {
  if (!OCR_DEEPSEEK_OPENAI_EXTRA_BODY.trim()) {
    return {
      skip_special_tokens: false,
      vllm_xargs: {
        ngram_size: 30,
        window_size: 90,
        whitelist_token_ids: [128821, 128822]
      }
    };
  }
  try {
    const parsed = JSON.parse(OCR_DEEPSEEK_OPENAI_EXTRA_BODY);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object');
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    throw createHttpError(500, `OCR_DEEPSEEK_OPENAI_EXTRA_BODY ${message}`);
  }
}

function debugDeepseekOcr(event, payload = {}) {
  if (!OCR_DEEPSEEK_DEBUG) {
    return;
  }
  console.log('[ocr:deepseek]', event, payload);
}

function summarizeOpenAiCompatibleRequest(requestBody) {
  const content = requestBody?.messages?.[0]?.content;
  return {
    model: requestBody?.model,
    max_tokens: requestBody?.max_tokens,
    temperature: requestBody?.temperature,
    extra_body_keys:
      requestBody?.extra_body && typeof requestBody.extra_body === 'object'
        ? Object.keys(requestBody.extra_body)
        : [],
    content:
      Array.isArray(content)
        ? content.map((item) => {
            if (!item || typeof item !== 'object') {
              return item;
            }
            if (item.type === 'image_url') {
              return {
                type: item.type,
                image_url: {
                  url:
                    typeof item.image_url?.url === 'string'
                      ? `${item.image_url.url.slice(0, 48)}...`
                      : null
                }
              };
            }
            if (item.type === 'text') {
              return {
                type: item.type,
                text: typeof item.text === 'string' ? item.text.slice(0, 240) : null
              };
            }
            return item;
          })
        : content
  };
}

function summarizeOpenAiCompatibleResponse(payload) {
  const rawContent = payload?.choices?.[0]?.message?.content;
  return {
    id: payload?.id,
    model: payload?.model,
    choice_count: Array.isArray(payload?.choices) ? payload.choices.length : 0,
    content_type: Array.isArray(rawContent) ? 'array' : typeof rawContent,
    content_preview:
      typeof rawContent === 'string'
        ? rawContent.slice(0, 400)
        : Array.isArray(rawContent)
          ? rawContent.slice(0, 4)
          : rawContent
  };
}

async function extractTextFromDeepseekOpenAiCompatible(absolute) {
  const requestUrl = resolveDeepseekOpenAiChatCompletionsUrl();
  const extraBody = parseDeepseekOpenAiExtraBody();
  const requestBody = {
    model: OCR_DEEPSEEK_OPENAI_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: absolute }
          },
          {
            type: 'text',
            text: OCR_DEEPSEEK_PROMPT
          }
        ]
      }
    ],
    max_tokens: OCR_DEEPSEEK_OPENAI_MAX_TOKENS,
    temperature: 0,
    extra_body: extraBody
  };
  debugDeepseekOcr('openai-compatible-request', {
    url: requestUrl,
    request: summarizeOpenAiCompatibleRequest(requestBody)
  });

  let payload;
  try {
    const { stdout, stderr } = await execFile(OCR_PYTHON_BIN, [
      DEEPSEEK_OCR_PYTHON_HELPER,
      '--image',
      absolute,
      '--base-url',
      OCR_DEEPSEEK_OPENAI_BASE_URL,
      '--api-key',
      OCR_DEEPSEEK_OPENAI_API_KEY,
      '--model',
      OCR_DEEPSEEK_OPENAI_MODEL,
      '--prompt',
      OCR_DEEPSEEK_PROMPT,
      '--max-tokens',
      String(OCR_DEEPSEEK_OPENAI_MAX_TOKENS),
      '--extra-body',
      JSON.stringify(extraBody)
    ], {
      maxBuffer: 20 * 1024 * 1024
    });
    payload = { choices: [{ message: { content: stdout.trim() } }] };
    if (stderr.trim()) {
      debugDeepseekOcr('openai-compatible-python-stderr', {
        output_preview: stderr.slice(0, 1200)
      });
    }
    debugDeepseekOcr('openai-compatible-response-json', summarizeOpenAiCompatibleResponse(payload));
  } catch (error) {
    if (error?.status && error?.message) {
      debugDeepseekOcr('openai-compatible-response-error', {
        url: requestUrl,
        status: error.status,
        body_preview: String(error.message).slice(0, 1200)
      });
      throw createHttpError(
        502,
        `Deepseek OpenAI-compatible OCR failed via ${requestUrl} (${error.status} ${error.message})`
      );
    }
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const message = error instanceof Error ? error.message : 'Connection error.';
    debugDeepseekOcr('openai-compatible-response-error', {
      url: requestUrl,
      status: 'connection',
      body_preview: `${String(message).slice(0, 600)} ${stderr.slice(0, 600)}`.trim()
    });
    throw createHttpError(502, `Deepseek OpenAI-compatible OCR failed via ${requestUrl} (${message})`);
  }

  const rawContent = payload?.choices?.[0]?.message?.content;
  const text = Array.isArray(rawContent)
    ? rawContent
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }
          if (part && typeof part === 'object' && typeof part.text === 'string') {
            return part.text;
          }
          return '';
        })
        .join('')
        .trim()
    : typeof rawContent === 'string'
      ? rawContent.trim()
      : '';
  debugDeepseekOcr('openai-compatible-extracted-text', {
    text_preview: text.slice(0, 600),
    text_length: text.length
  });
  if (!text) {
    throw createHttpError(502, 'Deepseek OpenAI-compatible OCR returned empty text');
  }
  return text;
}

async function extractTextFromDeepseekOcr(absolute) {
  if (OCR_DEEPSEEK_API_STYLE === 'openai') {
    return extractTextFromDeepseekOpenAiCompatible(absolute);
  }

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
    const response = await fetch(requestUrl, {
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
      model: 'gpt-5.4'
    });

    if (OCR_BACKEND === 'openai') {
      const openai = getOpenAI();
      const buffer = await fs.readFile(absolute);
      const base64 = buffer.toString('base64');

      const response = await openai.responses.create({
        model: 'gpt-5.4',
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
