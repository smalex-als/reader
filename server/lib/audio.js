import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { resolveDataUrl } from './paths.js';
import { getOpenAI } from './openai.js';
import { loadPageText } from './ocr.js';
import { stripMarkdown } from './streamText.js';

export async function resolvePageSpeechInput(image) {
  const { absolute, relative } = resolveDataUrl(image);
  const sourceStat = await safeStat(absolute);
  if (!sourceStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const generated = await loadPageText(image);
  const spokenText = stripMarkdown(generated.text).trim();

  if (!spokenText) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  return { relative, spokenText };
}

export function resolveTextSpeechInput(text) {
  const spokenText = stripMarkdown(typeof text === 'string' ? text : '').trim();
  if (!spokenText) {
    throw createHttpError(400, 'Text is required for audio generation');
  }
  return { spokenText };
}

export function resolvePageAudioOutput(image, provider = 'openai') {
  const { relative } = resolveDataUrl(image);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const audioRelative = provider === 'xai' ? `${baseName}.xai.mp3` : `${baseName}.mp3`;
  const audioAbsolute = path.join(DATA_DIR, audioRelative);
  return { audioRelative, audioAbsolute };
}

export async function createSpeechResponse({ spokenText, voiceProfile, responseFormat = 'mp3' }) {
  const openai = getOpenAI();
  return openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voiceProfile.openAiVoice,
    input: spokenText,
    response_format: responseFormat,
    instructions: voiceProfile.instructions
  });
}
