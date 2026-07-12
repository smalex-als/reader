import type { SubtitleCue } from '@/types/audioLibrary';

function parseTimestamp(value: string) {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const millis = Number.parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
  if (![hours, minutes, seconds, millis].every(Number.isFinite)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

const MIN_SUBTITLE_CUE_CHARS = 32;
const MIN_SUBTITLE_CUE_WORDS = 6;
const MAX_MERGED_SUBTITLE_CUE_CHARS = 140;
const MAX_MERGED_SUBTITLE_CUE_SECONDS = 12;

function countWords(input: string) {
  return input.trim().split(/\s+/).filter(Boolean).length;
}

function isSmallSubtitleCue(cue: SubtitleCue) {
  const text = cue.text.trim();
  return text.length < MIN_SUBTITLE_CUE_CHARS || countWords(text) <= MIN_SUBTITLE_CUE_WORDS;
}

function canMergeSubtitleCues(left: SubtitleCue, right: SubtitleCue) {
  const mergedText = `${left.text.trim()} ${right.text.trim()}`.trim();
  return (
    mergedText.length <= MAX_MERGED_SUBTITLE_CUE_CHARS &&
    right.endSeconds - left.startSeconds <= MAX_MERGED_SUBTITLE_CUE_SECONDS
  );
}

function endsIncomplete(text: string) {
  return text.trimEnd().endsWith(',') || text.trimEnd().endsWith(';') || text.trimEnd().endsWith(':') || /[-—–]$/.test(text.trimEnd());
}

function startsNewSentenceAfterTerminal(left: string, right: string) {
  const leftText = left.trimEnd();
  const rightText = right.trimStart();
  return Boolean(leftText && rightText && /[.?!]$/.test(leftText) && rightText[0] === rightText[0].toUpperCase());
}

function mergeAwkwardSubtitleCues(cues: SubtitleCue[]) {
  const merged: SubtitleCue[] = [];
  let pending: SubtitleCue | null = null;
  let pendingStartedSmall = false;
  let pendingMerged = false;
  for (const cue of cues) {
    if (!pending) {
      pending = { ...cue };
      pendingStartedSmall = isSmallSubtitleCue(cue);
      pendingMerged = false;
    } else if (
      (pendingStartedSmall || (endsIncomplete(pending.text) && isSmallSubtitleCue(cue))) &&
      canMergeSubtitleCues(pending, cue) &&
      !(pendingMerged && startsNewSentenceAfterTerminal(pending.text, cue.text))
    ) {
      pending.endSeconds = cue.endSeconds;
      pending.text = `${pending.text.trim()} ${cue.text.trim()}`.trim();
      pendingMerged = true;
    } else {
      merged.push(pending);
      pending = { ...cue };
      pendingStartedSmall = isSmallSubtitleCue(cue);
      pendingMerged = false;
    }
  }
  if (pending) {
    merged.push(pending);
  }
  return merged;
}

export function parseSrt(text: string): SubtitleCue[] {
  const cues = text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeIndex < 0) {
        return [];
      }
      const [startRaw, endRaw] = lines[timeIndex].split('-->').map((part) => part.trim());
      const startSeconds = parseTimestamp(startRaw);
      const endSeconds = parseTimestamp(endRaw);
      const cueText = lines.slice(timeIndex + 1).join(' ').trim();
      if (startSeconds === null || endSeconds === null || !cueText) {
        return [];
      }
      return [{ startSeconds, endSeconds, text: cueText }];
    });
  return mergeAwkwardSubtitleCues(cues);
}
