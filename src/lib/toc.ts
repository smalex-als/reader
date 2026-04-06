import type { TocEntry } from '@/types/app';

export function getDetailedTocLevel(
  entries: TocEntry[],
  index: number
): 0 | 1 | 2 {
  const entry = entries[index];
  if (!entry) {
    return 0;
  }

  if (Number.isInteger(entry.level)) {
    return Math.max(0, Math.min(2, entry.level ?? 0)) as 0 | 1 | 2;
  }

  const title = entry.title.trim();
  const previous = index > 0 ? entries[index - 1] : null;

  if (/^\d+\.\d+\.\d+\b/.test(title)) {
    return 2;
  }

  if (/^\d+\.\d+\b/.test(title)) {
    return 1;
  }

  if (/^[A-Z]\.\d+\b/.test(title)) {
    return 1;
  }

  if (previous && previous.page === entry.page) {
    return 1;
  }

  return 0;
}
