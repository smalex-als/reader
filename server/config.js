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
export const SEARCH_INDEX_FILENAME = 'search.index.json';
export const DEFAULT_VOICE = 'santa';
export const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
export const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;
export const STREAM_SERVER =
  process.env.STREAM_SERVER || process.env.VITE_STREAM_SERVER || 'http://192.168.1.174:3005';
export const STREAM_VOICE = process.env.STREAM_VOICE || process.env.VITE_STREAM_VOICE || '';
export const XAI_API_KEY = process.env.XAI_API_KEY || '';
export const LOCAL_STREAM_VOICES = [
  'en-Breeze_woman',
  'en-Brutalon_man',
  'en-Carter_man',
  'en-Clarion_man',
  'en-Clarissa_woman',
  'en-Davis_man',
  'en-Emma_woman',
  'en-Frank_man',
  'en-Grace_woman',
  'en-Gravitar_man',
  'en-Gravus_man',
  'en-MechCorsair_man',
  'en-Mike_man',
  'en-Oldenheart_man',
  'en-Silkvox_man',
  'en-Snarkling_woman',
  'en-Soother_woman'
];

export const OCR_BACKEND = process.env.OCR_BACKEND || 'openai'; // 'openai' | 'deepseek_ocr'
export const OCR_TIMEOUT_MS = Number.parseInt(process.env.OCR_TIMEOUT_MS || '20000', 10);
export const OCR_DEEPSEEK_HOST = process.env.OCR_DEEPSEEK_HOST || 'http://reader.test:11434';
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
export const CHAPTER_SIMPLE_PROMPT = readPrompt('chapters.simple.txt');
export const CHAPTER_NARRATION_PROMPT = readPrompt('chapter-narration.txt');
export const CHAPTER_QUIZ_PROMPT = readPrompt('chapter-quiz.txt');
export const CHAPTER_VOCAB_PROMPT = readPrompt('chapter-vocab.txt');
export const CHAPTER_MEMORY_CARD_PROMPT = readPrompt('chapter-memory-card.txt');
export const CHAPTER_REVIEW_EXTRACT_PROMPT = readPrompt('chapter-review-extract.txt');
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
  },
  nyc_cabbie: {
    openAiVoice: 'ash',
    instructions: `Identity: NYC Cabbie

Voice: Gruff, fast-talking, and a little worn-out, like a New York cabbie who's seen it all but still keeps things moving.

Tone: Slightly exasperated but still functional, with a mix of sarcasm and no-nonsense efficiency.

Dialect: Strong New York accent, with dropped "r"s, sharp consonants, and classic phrases like whaddaya and lemme guess.

Pronunciation: Quick and clipped, with a rhythm that mimics the natural hustle of a busy city conversation.

Features: Uses informal, straight-to-the-point language, throws in some dry humor, and keeps the energy just on the edge of impatience but still helpful.`
  }
};
export const DEFAULT_STREAM_VOICE = STREAM_VOICE || DEFAULT_VOICE || 'en-Mike_man';

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
export const PDF_EXTENSIONS = new Set(['.pdf']);
const maxUploadMbRaw = Number.parseInt(process.env.MAX_UPLOAD_MB || '300', 10);
const maxUploadMb = Number.isFinite(maxUploadMbRaw) && maxUploadMbRaw > 0 ? maxUploadMbRaw : 300;
export const MAX_UPLOAD_BYTES = maxUploadMb * 1024 * 1024;
