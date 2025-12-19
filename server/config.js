import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

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
export const LLMPROXY_ENDPOINT = 'http://192.168.1.174:11434/api/generate';
export const LLMPROXY_MODEL = 'ministral-3:14b';
export const LLMPROXY_AUTH = 'dummy';

export const TEXT_PROMPT = `Extract all visible text from this image as plain text. Normalize all fractions: instead of Unicode characters like ½ or ¼, use plain text equivalents like 1/2, 1/4, 1 1/2, etc. Do not use emojis, special characters, or markdown. Keep the content exactly as it appears, but ensure formatting is consistent: use normal paragraphs with one empty line between them. Preserve line breaks and indentation only where they represent clear paragraph or step boundaries. Ignore page numbers, footers, and obvious scanning artifacts. Do not add commentary. Extract all visible text from this image as plain text. Do NOT return JSON. Do NOT use braces, keys, or structured formats. Output only continuous human-readable text.`;
export const NARRATION_PROMPT = `You will be given extracted OCR text from a scanned page (often a recipe).

Rewrite it into a version adapted for spoken narration (text-to-speech).

Rules:
- Output plain text only (no markdown).
- Preserve meaning and factual content; do not add new information.
- Fix obvious OCR artifacts, broken words, and hyphenation.
- Combine hard line breaks into natural sentences, but keep paragraph breaks where they help narration.
- Convert bullets/numbered steps into spoken-friendly phrasing.
- Keep the same language as the input.
- Normalize weird symbols into words when helpful for speech.

Nutrition guidance (recipe books):
- If the page includes a detailed “Nutrition per serving” section, do NOT narrate the full breakdown (e.g., grams of fat, sodium, etc.).
- Instead, give a short summary: approximate calories (or just “about X calories” if present) and a qualitative macro balance like “protein-heavy”, “carb-heavy”, “high in fat”, or “balanced”.
- If calories are not present, omit calories and only give the qualitative macro balance if the text clearly implies it; otherwise omit nutrition entirely.

Return only the adapted narration text.`;
export const TOC_PROMPT = `You are creating a table of contents from OCR snippets per page.

You will be given a list of page numbers and OCR text snippets. Identify likely section or chapter titles and the page where they begin.

Rules:
- Output strict JSON only (no markdown, no extra text).
- Return an array of objects with shape: {"title": string, "page": number}.
- Page numbers are 1-based and must match the input pages.
- Keep titles concise and faithful to the text.
- Prefer fewer, higher-quality entries over too many.
- If no clear structure exists, return [].
`;

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
