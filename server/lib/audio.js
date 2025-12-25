import path from 'node:path';
import fs from 'node:fs/promises';
import { DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { resolveDataUrl } from './paths.js';
import { getOpenAI } from './openai.js';
import { loadPageText } from './ocr.js';

export async function handlePageAudio({ image, voiceProfile }) {
  const { absolute, relative } = resolveDataUrl(image);
  const sourceStat = await safeStat(absolute);
  if (!sourceStat?.isFile()) {
    throw createHttpError(404, 'Image not found');
  }

  const baseName = relative.replace(/\.[^.]+$/, '');
  const audioRelative = `${baseName}.mp3`;
  const audioAbsolute = path.join(DATA_DIR, audioRelative);

  const existingAudio = await safeStat(audioAbsolute);
  if (existingAudio?.isFile()) {
    return {
      source: 'file',
      url: `/data/${audioRelative}`
    };
  }

  const generated = await loadPageText(image);
  const spokenText = generated.text.trim();

  if (!spokenText) {
    throw createHttpError(400, 'No text available for audio generation');
  }

  const openai = getOpenAI();
  const speech = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voiceProfile.openAiVoice,
    input: spokenText,
    format: 'mp3',
    instructions: voiceProfile.instructions
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
  await fs.writeFile(audioAbsolute, audioBuffer);

  return {
    source: 'ai',
    url: `/data/${audioRelative}`
  };
}
