import { prepareChapterAudio, finalizeDirectChapterAudio } from './streamAudio.js';
import { generateDirectChapterMp3Buffer } from './directChapterAudio.js';
import { generateYandexTtsAudioBuffer } from './yandexTts.js';

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

  const { mp3Buffer, subchapters } = await generateDirectChapterMp3Buffer({
    segments: preparation.speechSegments,
    voice,
    mp3Path: preparation.mp3Path,
    generateChunk: generateYandexTtsAudioBuffer
  });

  await finalizeDirectChapterAudio({
    mp3Path: preparation.mp3Path,
    mp3Buffer,
    metaPath: preparation.metaPath,
    versionId: preparation.versionId,
    provider: 'yandex',
    voice,
    subchapters
  });

  return {
    mp3Url: preparation.mp3Url,
    cleanText: preparation.cleanText,
    versionId: preparation.versionId
  };
}
