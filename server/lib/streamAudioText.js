import { splitStreamChunks } from './streamText.js';

const STREAM_TEXT_LIMIT = 2000;
const STREAM_QUERY_TEXT_LIMIT = 1200;

export function splitTextForStreaming(input) {
  const splitForEncodedLength = (chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) {
      return [];
    }
    if (
      trimmed.length <= STREAM_TEXT_LIMIT &&
      encodeURIComponent(trimmed).length <= STREAM_QUERY_TEXT_LIMIT
    ) {
      return [trimmed];
    }

    const parts = [];
    let remaining = trimmed;
    while (remaining.length > 0) {
      let candidate = '';
      let consumedEnd = 0;
      const words = Array.from(remaining.matchAll(/\S+/g));

      for (let index = 0; index < words.length; index += 1) {
        const word = words[index][0];
        const nextCandidate = candidate ? `${candidate} ${word}` : word;
        if (
          nextCandidate.length > STREAM_TEXT_LIMIT ||
          encodeURIComponent(nextCandidate).length > STREAM_QUERY_TEXT_LIMIT
        ) {
          if (!candidate) {
            let sliceLength = Math.min(STREAM_TEXT_LIMIT, word.length);
            while (sliceLength > 1) {
              const slice = word.slice(0, sliceLength).trim();
              if (encodeURIComponent(slice).length <= STREAM_QUERY_TEXT_LIMIT) {
                candidate = slice;
                consumedEnd = (words[index].index ?? 0) + sliceLength;
                break;
              }
              sliceLength -= 1;
            }
          }
          break;
        }
        candidate = nextCandidate;
        consumedEnd = (words[index].index ?? 0) + word.length;
      }

      const nextPart = candidate.trim();
      if (!nextPart) {
        break;
      }
      parts.push(nextPart);
      remaining = remaining.slice(consumedEnd).trim();
    }

    return parts;
  };

  return splitStreamChunks(input.trim(), 0).flatMap(splitForEncodedLength);
}
