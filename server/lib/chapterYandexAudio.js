import { prepareChapterAudio, finalizeDirectChapterAudio } from './streamAudio.js';
import { generateYandexTtsAudioBuffer } from './yandexTts.js';
import { splitStreamChunks } from './streamText.js';
import { normalizeMp3Chunk } from './mp3Chunks.js';

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
    cleanText: preparation.cleanText,
    versionId: preparation.versionId
  };
}
