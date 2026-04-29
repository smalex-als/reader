import { prepareChapterAudio, finalizeDirectChapterAudio } from './streamAudio.js';
import { generateXaiTtsAudioBuffer } from './xaiTts.js';

export async function generateChapterXaiAudio({
  bookId,
  chapterNumber,
  versionId = null,
  voice = 'Eve'
}) {
  const preparation = await prepareChapterAudio({
    bookId,
    chapterNumber,
    versionId,
    provider: 'xai'
  });

  if ('existingAudioUrl' in preparation) {
    return preparation;
  }

  const mp3Buffer = await generateXaiTtsAudioBuffer({
    text: preparation.cleanText,
    voice
  });

  await finalizeDirectChapterAudio({
    mp3Path: preparation.mp3Path,
    mp3Buffer,
    metaPath: preparation.metaPath,
    versionId: preparation.versionId,
    provider: 'xai'
  });

  return {
    mp3Url: preparation.mp3Url,
    cleanText: preparation.cleanText,
    versionId: preparation.versionId
  };
}
