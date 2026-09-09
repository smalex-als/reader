import type { ChapterTextVersion } from '../types/app';

export type ComparisonSelection = {
  chapterNumber: number;
  version: ChapterTextVersion;
};

// Version IDs are chapter-local: v1 in another chapter may use a different prompt.
export function resolveComparisonVersion(
  selection: ComparisonSelection,
  chapterNumber: number,
  versions: ChapterTextVersion[]
) {
  if (selection.version.kind === 'base') {
    return versions.find((version) => version.kind === 'base') ?? null;
  }
  if (selection.chapterNumber === chapterNumber) {
    return versions.find((version) => version.id === selection.version.id) ?? null;
  }
  const matches = versions.filter((version) => version.kind === 'derived' && (
    selection.version.promptId
      ? version.promptId === selection.version.promptId
      : selection.version.promptName
        ? version.promptName === selection.version.promptName
        : !/^Version \d+$/i.test(selection.version.label) && version.label === selection.version.label
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function getLinkedScrollTop(sourceTop: number, sourceRange: number, targetRange: number) {
  if (sourceRange <= 0 || targetRange <= 0) return 0;
  return Math.min(1, Math.max(0, sourceTop / sourceRange)) * targetRange;
}
