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
export const DEFAULT_VOICE = 'santa';
export const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
export const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;

export const OCR_BACKEND = 'llmproxy'; // 'openai' | 'llmproxy'
export const LLMPROXY_ENDPOINT =
  process.env.LLMPROXY_ENDPOINT || 'http://myserver.home:11434/api/generate';
export const LLMPROXY_MODEL = 'ministral-3:14b';
export const LLMPROXY_AUTH = 'dummy';
export const LLMPROXY_HEADERS_TIMEOUT_MS = Number.parseInt(
  process.env.LLMPROXY_HEADERS_TIMEOUT_MS || '900000',
  10
);
export const LLMPROXY_BODY_TIMEOUT_MS = Number.parseInt(
  process.env.LLMPROXY_BODY_TIMEOUT_MS || '900000',
  10
);
export const LLMPROXY_CONNECT_TIMEOUT_MS = Number.parseInt(
  process.env.LLMPROXY_CONNECT_TIMEOUT_MS || '30000',
  10
);

const PROMPTS_DIR = path.join(ROOT_DIR, 'server', 'prompts');
const readPrompt = (filename) =>
  readFileSync(path.join(PROMPTS_DIR, filename), 'utf8').trim();

export const TEXT_PROMPT = readPrompt('text.txt');
export const TOC_PROMPT = readPrompt('toc.txt');
export const INSIGHTS_PROMPT = readPrompt('insights.txt');
export const CHAPTER_SPLIT_PROMPT = readPrompt('chapters.txt');

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
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
