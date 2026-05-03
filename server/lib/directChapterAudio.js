import path from 'node:path';
import { createHttpError } from './errors.js';
import { normalizeMp3Chunk } from './mp3Chunks.js';
import { getMp3BufferDurationSeconds } from './streamAudio.js';
import { splitStreamChunks } from './streamText.js';

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function closeSubchapter(entry, endSeconds) {
  if (!entry) {
    return null;
  }
  const roundedEnd = roundSeconds(endSeconds);
  return {
    title: entry.title,
    startSeconds: entry.startSeconds,
    endSeconds: roundedEnd,
    durationSeconds: roundSeconds(Math.max(0, roundedEnd - entry.startSeconds))
  };
}

function buildSpeechChunkRecords({ segments, chunkSize, lookahead }) {
  return segments.flatMap((section, sectionIndex) => {
    const chunks =
      typeof chunkSize === 'number'
        ? splitStreamChunks(section.text, 0, chunkSize, lookahead)
        : splitStreamChunks(section.text, 0);
    return chunks.map((text) => ({
      text,
      sectionIndex,
      title: section.title
    }));
  });
}

export async function generateDirectChapterMp3Buffer({
  segments,
  voice,
  mp3Path,
  chunkSize,
  lookahead,
  generateChunk
}) {
  const chunkRecords = buildSpeechChunkRecords({ segments, chunkSize, lookahead });
  const mp3Chunks = [];
  const subchapters = [];
  let activeSubchapter = null;
  let elapsedSeconds = 0;

  for (let index = 0; index < chunkRecords.length; index += 1) {
    const chunk = chunkRecords[index];
    if (chunk.title && activeSubchapter?.sectionIndex !== chunk.sectionIndex) {
      const closed = closeSubchapter(activeSubchapter, elapsedSeconds);
      if (closed) {
        subchapters.push(closed);
      }
      activeSubchapter = {
        sectionIndex: chunk.sectionIndex,
        title: chunk.title,
        startSeconds: roundSeconds(elapsedSeconds)
      };
    }

    const mp3Chunk = await generateChunk({ text: chunk.text, voice });
    const durationSeconds = await getMp3BufferDurationSeconds(mp3Chunk, path.dirname(mp3Path));
    if (durationSeconds === null) {
      throw createHttpError(502, 'Failed to read generated MP3 chunk duration');
    }
    elapsedSeconds += durationSeconds;
    mp3Chunks.push(normalizeMp3Chunk(mp3Chunk, index, chunkRecords.length));
  }

  const closed = closeSubchapter(activeSubchapter, elapsedSeconds);
  if (closed) {
    subchapters.push(closed);
  }

  return {
    mp3Buffer: Buffer.concat(mp3Chunks),
    subchapters
  };
}
