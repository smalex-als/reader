import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHttpError } from './errors.js';
import { getOpenAI } from './openai.js';

const execFileAsync = promisify(execFile);

export const OPENAI_TRANSCRIPTION_MODEL = 'gpt-transcribe';
export const OPENAI_TRANSCRIPTION_SAFE_FILE_BYTES = 24 * 1000 * 1000;
const CHUNK_DURATION_SECONDS = 15 * 60;

export function buildTranscriptionChunkArgs({ audioPath, outputPattern }) {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    audioPath,
    '-map',
    '0:a:0',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '64k',
    '-f',
    'segment',
    '-segment_time',
    String(CHUNK_DURATION_SECONDS),
    '-reset_timestamps',
    '1',
    outputPattern
  ];
}

export function extractOpenAITranscriptionText(result) {
  const text = typeof result === 'string' ? result : result?.text;
  return typeof text === 'string' ? text.trim() : '';
}

async function transcribeFile(filePath) {
  const result = await getOpenAI().audio.transcriptions.create({
    file: createReadStream(filePath),
    model: OPENAI_TRANSCRIPTION_MODEL
  });
  const text = extractOpenAITranscriptionText(result);
  if (!text) {
    throw createHttpError(502, 'OpenAI gpt-transcribe produced an empty transcript');
  }
  return text;
}

async function createAudioChunks(audioPath, directory) {
  const outputPattern = path.join(directory, 'chunk-%04d.mp3');
  try {
    await execFileAsync('ffmpeg', buildTranscriptionChunkArgs({ audioPath, outputPattern }), {
      timeout: 3 * 60 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    throw createHttpError(
      502,
      `Unable to prepare audio for OpenAI transcription: ${error instanceof Error ? error.message : 'ffmpeg failed'}`
    );
  }
  const filenames = (await fs.readdir(directory))
    .filter((filename) => /^chunk-\d+\.mp3$/.test(filename))
    .sort();
  if (filenames.length === 0) {
    throw createHttpError(502, 'ffmpeg did not produce audio chunks for transcription');
  }
  return filenames.map((filename) => path.join(directory, filename));
}

export async function transcribeAudioWithOpenAI(audioPath) {
  const audioStat = await fs.stat(audioPath);
  if (audioStat.size <= OPENAI_TRANSCRIPTION_SAFE_FILE_BYTES) {
    return transcribeFile(audioPath);
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-gpt-transcribe-'));
  try {
    const chunkPaths = await createAudioChunks(audioPath, temporaryDirectory);
    const transcripts = [];
    for (const chunkPath of chunkPaths) {
      const chunkStat = await fs.stat(chunkPath);
      if (chunkStat.size > OPENAI_TRANSCRIPTION_SAFE_FILE_BYTES) {
        throw createHttpError(502, 'An audio chunk exceeds the OpenAI 25 MB upload limit');
      }
      transcripts.push(await transcribeFile(chunkPath));
    }
    return transcripts.join('\n\n').trim();
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
