import { prepareChapterAudio, finalizeDirectChapterAudio } from './streamAudio.js';
import { generateYandexTtsAudioBuffer } from './yandexTts.js';
import { splitStreamChunks } from './streamText.js';

function readSyncsafeInt(buffer, offset) {
  if (buffer.length < offset + 4) {
    return null;
  }
  return (
    ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f)
  );
}

function stripLeadingId3(buffer) {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString('ascii') !== 'ID3') {
    return buffer;
  }
  const tagSize = readSyncsafeInt(buffer, 6);
  if (tagSize === null) {
    return buffer;
  }
  const footerSize = buffer[5] & 0x10 ? 10 : 0;
  const totalSize = 10 + tagSize + footerSize;
  return totalSize < buffer.length ? buffer.subarray(totalSize) : buffer;
}

function stripTrailingId3v1(buffer) {
  if (buffer.length < 128 || buffer.subarray(buffer.length - 128, buffer.length - 125).toString('ascii') !== 'TAG') {
    return buffer;
  }
  return buffer.subarray(0, buffer.length - 128);
}

function normalizeMp3Chunk(buffer, index, count) {
  let next = buffer;
  if (index > 0) {
    next = stripLeadingId3(next);
  }
  if (index < count - 1) {
    next = stripTrailingId3v1(next);
  }
  return next;
}

async function generateYandexChapterMp3Buffer({ text, voice }) {
  const chunks = splitStreamChunks(text, 0);
  if (chunks.length <= 1) {
    return generateYandexTtsAudioBuffer({ text, voice });
  }

  const mp3Chunks = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const mp3Chunk = await generateYandexTtsAudioBuffer({
      text: chunks[index],
      voice
    });
    mp3Chunks.push(normalizeMp3Chunk(mp3Chunk, index, chunks.length));
  }
  return Buffer.concat(mp3Chunks);
}

export async function generateChapterYandexAudio({
  bookId,
  chapterNumber,
  versionId = null,
  voice = 'alena'
}) {
  const preparation = await prepareChapterAudio({
    bookId,
    chapterNumber,
    versionId,
    provider: 'yandex'
  });

  if ('existingAudioUrl' in preparation) {
    return preparation;
  }

  const mp3Buffer = await generateYandexChapterMp3Buffer({
    text: preparation.cleanText,
    voice
  });

  await finalizeDirectChapterAudio({
    mp3Path: preparation.mp3Path,
    mp3Buffer,
    metaPath: preparation.metaPath,
    versionId: preparation.versionId,
    provider: 'yandex'
  });

  return {
    mp3Url: preparation.mp3Url,
    versionId: preparation.versionId
  };
}
