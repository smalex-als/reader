import path from 'node:path';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DATA_DIR } from '../config.js';
import { createHttpError } from './errors.js';
import { safeStat } from './fs.js';
import { resolveDataUrl } from './paths.js';
import { getOpenAI } from './openai.js';
import { loadPageText } from './ocr.js';
import { stripMarkdown } from './streamText.js';
import { generateXaiTtsAudioBuffer } from './xaiTts.js';

function toNodeReadableStream(streamBody) {
  if (!streamBody) {
    return null;
  }
  if (typeof streamBody.pipe === 'function') {
    return streamBody;
  }
  if (typeof streamBody.getReader === 'function') {
    return Readable.fromWeb(streamBody);
  }
  return null;
}

async function writeSpeechResponseToFile(speech, outputPath) {
  const outputDir = path.dirname(outputPath);
  const tempPath = `${outputPath}.part-${Date.now()}-${process.pid}`;
  await fs.mkdir(outputDir, { recursive: true });

  try {
    const bodyStream = toNodeReadableStream(speech.body);
    if (bodyStream) {
      await pipeline(bodyStream, createWriteStream(tempPath));
    } else {
      const audioBuffer = Buffer.from(await speech.arrayBuffer());
      await fs.writeFile(tempPath, audioBuffer);
    }
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function resolvePageSpeechInput(image) {
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

function resolveTextSpeechInput(text) {
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

export function resolveTextAudioOutput({ text, provider = 'openai', voice = 'default' }) {
  const digest = crypto
    .createHash('sha1')
    .update(`${provider}:${voice}:${stripMarkdown(typeof text === 'string' ? text : '').trim()}`)
    .digest('hex')
    .slice(0, 16);
  const suffix = provider === 'xai' ? '.xai.mp3' : '.mp3';
  const audioRelative = `_generated/text-audio-${digest}${suffix}`;
  const audioAbsolute = path.join(DATA_DIR, audioRelative);
  return { audioRelative, audioAbsolute };
}

async function createSpeechResponse({ spokenText, voiceProfile, responseFormat = 'mp3' }) {
  const openai = getOpenAI();
  return openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: voiceProfile.openAiVoice,
    input: spokenText,
    response_format: responseFormat,
    instructions: voiceProfile.instructions
  });
}

export async function createPageAudioStream({ image, voiceProfile }) {
  const { spokenText } = await resolvePageSpeechInput(image);
  return createSpeechResponse({ spokenText, voiceProfile, responseFormat: 'mp3' });
}

export async function createTextAudioStream({ text, voiceProfile }) {
  const { spokenText } = resolveTextSpeechInput(text);
  return createSpeechResponse({ spokenText, voiceProfile, responseFormat: 'mp3' });
}

export async function handlePageAudio({ image, voiceProfile, provider = 'openai' }) {
  const { relative, spokenText } = await resolvePageSpeechInput(image);
  const baseName = relative.replace(/\.[^.]+$/, '');
  const audioRelative = provider === 'xai' ? `${baseName}.xai.mp3` : `${baseName}.mp3`;
  const audioAbsolute = path.join(DATA_DIR, audioRelative);

  const existingAudio = await safeStat(audioAbsolute);
  if (existingAudio?.isFile()) {
    return {
      source: 'file',
      url: `/data/${audioRelative}`
    };
  }

  if (provider === 'xai') {
    const audioBuffer = await generateXaiTtsAudioBuffer({ text: spokenText, voice: 'Eve' });
    await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
    await fs.writeFile(audioAbsolute, audioBuffer);
  } else {
    const speech = await createSpeechResponse({ spokenText, voiceProfile, responseFormat: 'mp3' });
    await writeSpeechResponseToFile(speech, audioAbsolute);
  }

  return {
    source: 'ai',
    url: `/data/${audioRelative}`
  };
}

export async function handleTextAudio({
  text,
  voiceProfile,
  provider = 'openai',
  voice = ''
}) {
  const { spokenText } = resolveTextSpeechInput(text);
  const { audioRelative, audioAbsolute } = resolveTextAudioOutput({
    text: spokenText,
    provider,
    voice: voice || voiceProfile?.openAiVoice || 'default'
  });

  const existingAudio = await safeStat(audioAbsolute);
  if (existingAudio?.isFile()) {
    return {
      source: 'file',
      url: `/data/${audioRelative}`
    };
  }

  if (provider === 'xai') {
    const audioBuffer = await generateXaiTtsAudioBuffer({ text: spokenText, voice: voice || 'Eve' });
    await fs.mkdir(path.dirname(audioAbsolute), { recursive: true });
    await fs.writeFile(audioAbsolute, audioBuffer);
  } else {
    const speech = await createSpeechResponse({ spokenText, voiceProfile, responseFormat: 'mp3' });
    await writeSpeechResponseToFile(speech, audioAbsolute);
  }

  return {
    source: 'ai',
    url: `/data/${audioRelative}`
  };
}
