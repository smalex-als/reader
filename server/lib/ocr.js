import path from 'node:path';
import fs from 'node:fs/promises';
import mime from 'mime-types';
import {
  DATA_DIR,
  LLMPROXY_AUTH,
  LLMPROXY_ENDPOINT,
  LLMPROXY_MODEL,
  NARRATION_PROMPT,
  OCR_BACKEND,
  TEXT_PROMPT
} from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { resolveDataUrl } from './paths.js';
import { getOpenAI } from './openai.js';

function deriveNarrationRelative(textRelative) {
  if (typeof textRelative !== 'string' || !textRelative.length) {
    return textRelative;
  }
  if (textRelative.endsWith('.txt')) {
    return textRelative.replace(/\.txt$/i, '.narration.txt');
  }
  return `${textRelative}.narration.txt`;
}

function adaptTextForNarrationHeuristic(text) {
  const input = typeof text === 'string' ? text : '';
  if (!input.trim()) {
    return '';
  }

  const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove common end-of-line hyphenation from scanned text.
  const dehyphenated = normalized.replace(/(\p{L})-\n(\p{L})/gu, '$1$2');

  const paragraphs = dehyphenated
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);

  const narration = paragraphs
    .join('\n\n')
    // Normalize common bullet characters into a simple dash for TTS.
    .replace(/[•●◦▪]/g, '-')
    .trim();

  return narration;
}

async function generateNarrationTextFromLLM(text) {
  const input = typeof text === 'string' ? text : '';
  if (!input.trim()) {
    return '';
  }

  if (!process.env.OPENAI_API_KEY) {
    return '';
  }

  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: 'gpt-5.2',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: NARRATION_PROMPT },
          { type: 'input_text', text: input.trim() }
        ]
      }
    ]
  });

  const narration =
    response.output_text?.trim() ||
    response?.output?.[0]?.content?.[0]?.text?.trim() ||
    '';

  return narration;
}

async function extractTextFromLlmproxy(absolute) {
  const buffer = await fs.readFile(absolute);
  const base64 = buffer.toString('base64');

  const response = await fetch(LLMPROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLMPROXY_AUTH}`
    },
    body: JSON.stringify({
      model: LLMPROXY_MODEL,
      prompt: TEXT_PROMPT,
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
  const { skipCache = false, skipNarration = false } = options;
  const { absolute, relative } = resolveDataUrl(imageUrl);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const textRelative = `${baseName}.txt`;
  const textAbsolute = path.join(DATA_DIR, textRelative);
  const narrationRelative = deriveNarrationRelative(textRelative);
  const narrationAbsolute = path.join(DATA_DIR, narrationRelative);

  const textStat = await safeStat(textAbsolute);
  if (textStat?.isFile() && !skipCache) {
    const textContent = await fs.readFile(textAbsolute, 'utf8');
    let narrationText = '';
    if (!skipNarration) {
      const narrationStat = await safeStat(narrationAbsolute);
      if (narrationStat?.isFile()) {
        narrationText = await fs.readFile(narrationAbsolute, 'utf8');
      } else {
        try {
          narrationText = await generateNarrationTextFromLLM(textContent);
        } catch (error) {
          console.warn('Narration adaptation failed; falling back to heuristic', error);
          narrationText = '';
        }

        if (!narrationText) {
          narrationText = adaptTextForNarrationHeuristic(textContent);
        }

        if (narrationText) {
          await fs.mkdir(path.dirname(narrationAbsolute), { recursive: true });
          await fs.writeFile(narrationAbsolute, narrationText, 'utf8');
        }
      }
    }
    return {
      source: 'file',
      text: textContent,
      narrationText,
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
  if (OCR_BACKEND === 'llmproxy') {
    text = await extractTextFromLlmproxy(absolute);
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
              text: TEXT_PROMPT
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

  if (!text) {
    throw createHttpError(502, 'Failed to generate text');
  }

  let narrationText = '';
  if (!skipNarration) {
    try {
      narrationText = await generateNarrationTextFromLLM(text);
    } catch (error) {
      console.warn('Narration adaptation failed; falling back to heuristic', error);
      narrationText = '';
    }
    if (!narrationText) {
      narrationText = adaptTextForNarrationHeuristic(text);
    }
  }

  await fs.mkdir(path.dirname(textAbsolute), { recursive: true });
  await fs.writeFile(textAbsolute, text, 'utf8');
  if (narrationText) {
    await fs.mkdir(path.dirname(narrationAbsolute), { recursive: true });
    await fs.writeFile(narrationAbsolute, narrationText, 'utf8');
  }

  return {
    source: 'ai',
    text,
    narrationText,
    url: `/data/${textRelative}`,
    absolutePath: textAbsolute
  };
}
