import { prepareChapterAudio, finalizeDirectChapterAudio } from './streamAudio.js';
import { generateDirectChapterMp3Buffer } from './directChapterAudio.js';
import { generateXaiTtsAudioBuffer } from './xaiTts.js';

const XAI_CHAPTER_CHUNK_SIZE = 7_500;
const XAI_CHAPTER_CHUNK_LOOKAHEAD = 800;

export async function generateChapterXaiAudio({
  bookId,
  chapterNumber,
  versionId = null,
  voice = 'Eve',
  force = false
}) {
  const preparation = await prepareChapterAudio({
    bookId,
    chapterNumber,
    versionId,
    provider: 'xai',
    voice,
    force
  });

  if ('existingAudioUrl' in preparation) {
    return preparation;
  }

  const { mp3Buffer, subchapters } = await generateDirectChapterMp3Buffer({
    segments: preparation.speechSegments,
    voice,
    mp3Path: preparation.mp3Path,
    chunkSize: XAI_CHAPTER_CHUNK_SIZE,
    lookahead: XAI_CHAPTER_CHUNK_LOOKAHEAD,
    generateChunk: generateXaiTtsAudioBuffer
  });

  await finalizeDirectChapterAudio({
    mp3Path: preparation.mp3Path,
    mp3Buffer,
    metaPath: preparation.metaPath,
    versionId: preparation.versionId,
    provider: 'xai',
    voice,
    textHash: preparation.textHash,
    subchapters
  });

  return {
    mp3Url: preparation.mp3Url,
    cleanText: preparation.cleanText,
    versionId: preparation.versionId
  };
}
