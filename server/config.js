import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');

export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');
export const STATIC_ROOT = existsSync(DIST_DIR) ? DIST_DIR : ROOT_DIR;

export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = Number.parseInt(process.env.PORT || '3000', 10);
export const BOOKMARKS_FILENAME = 'bookmarks.txt';
export const TOC_FILENAME = 'toc.json';
export const DETAILED_TOC_FILENAME = 'toc.detailed.json';
export const DEFAULT_VOICE = 'santa';
export const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
export const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;
export const STREAM_SERVER =
  process.env.STREAM_SERVER || process.env.VITE_STREAM_SERVER || 'https://myserver.home:3000';
export const STREAM_VOICE = process.env.STREAM_VOICE || process.env.VITE_STREAM_VOICE || '';

export const OCR_BACKEND = process.env.OCR_BACKEND || 'openai'; // 'openai' | 'deepseek_ocr'
export const OCR_DEEPSEEK_HOST = process.env.OCR_DEEPSEEK_HOST || 'http://myserver.home:11434';
export const OCR_DEEPSEEK_PATH = process.env.OCR_DEEPSEEK_PATH || '/api/generate';
export const OCR_DEEPSEEK_MODEL = process.env.OCR_DEEPSEEK_MODEL || 'deepseek-ocr';
export const OCR_DEEPSEEK_PROMPT =
  process.env.OCR_DEEPSEEK_PROMPT || '\n<|grounding|>Convert the\ndocument to markdown.';

const PROMPTS_DIR = path.join(ROOT_DIR, 'server', 'prompts');
const readPrompt = (filename) =>
  readFileSync(path.join(PROMPTS_DIR, filename), 'utf8').trim();
const promptCache = new Map();
const normalizePromptKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_');

export const TEXT_PROMPT = readPrompt('text.txt');
export const TOC_PROMPT = readPrompt('toc.txt');
export const CHAPTER_SPLIT_PROMPT = readPrompt('chapters.txt');
export const CHAPTER_NARRATION_PROMPT = readPrompt('chapter-narration.txt');
export const getTextPrompt = ({ backend, model } = {}) => {
  const cacheKey = `${backend || ''}|${model || ''}`;
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  const candidates = [];
  const normalizedModel = normalizePromptKey(model);
  if (normalizedModel) {
    candidates.push(`text.${normalizedModel}.txt`);
  }
  const normalizedBackend = normalizePromptKey(backend);
  if (normalizedBackend) {
    candidates.push(`text.${normalizedBackend}.txt`);
  }
  candidates.push('text.txt');

  for (const filename of candidates) {
    const promptPath = path.join(PROMPTS_DIR, filename);
    if (existsSync(promptPath)) {
      const prompt = readPrompt(filename);
      promptCache.set(cacheKey, prompt);
      return prompt;
    }
  }

  promptCache.set(cacheKey, TEXT_PROMPT);
  return TEXT_PROMPT;
};

export const voiceProfiles = {
  santa: {
    openAiVoice: 'ash',
    instructions: `Identity: Santa Claus

Affect: Jolly, warm, and cheerful, with a playful and magical quality that fits Santa's personality.

Tone: Festive and welcoming, creating a joyful, holiday atmosphere for the caller.

Emotion: Joyful and playful, filled with holiday spirit, ensuring the caller feels excited and appreciated.

Pronunciation: Clear, articulate, and exaggerated in key festive phrases to maintain clarity and fun.

Pause: Brief pauses after each option and statement to allow for processing and to add a natural flow to the message.`
  }
};

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const PDF_EXTENSIONS = new Set(['.pdf']);
const maxUploadMbRaw = Number.parseInt(process.env.MAX_UPLOAD_MB || '300', 10);
const maxUploadMb = Number.isFinite(maxUploadMbRaw) && maxUploadMbRaw > 0 ? maxUploadMbRaw : 300;
export const MAX_UPLOAD_BYTES = maxUploadMb * 1024 * 1024;
