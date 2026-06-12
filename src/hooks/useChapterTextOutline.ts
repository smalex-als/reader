import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { onFloatingAudioSubchapterSelect } from '@/lib/floatingAudioEvents';

export type TextOutlineItem = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  offset: number;
};

function slugifyHeading(input: string) {
  return input
    .toLowerCase()
    .replace(/[`*_~[\]()]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeOutlineTitle(input: string) {
  return input
    .replace(/^#{1,6}\s+/, '')
    .replace(/[`*_~[\]()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNavigationTitle(input: string) {
  return normalizeOutlineTitle(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFallbackOutline(input: string): TextOutlineItem[] {
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const paragraphPattern = /\S[\s\S]*?(?=(?:\n\s*\n)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(input)) !== null) {
    const rawParagraph = match[0]?.trim();
    if (!rawParagraph) {
      continue;
    }
    const firstLine = normalizeOutlineTitle(rawParagraph.split('\n')[0] ?? '');
    if (!firstLine) {
      continue;
    }
    const isCompact = rawParagraph.length <= 120;
    const hasFewWords = firstLine.split(/\s+/).length <= 10;
    const looksLikeHeading = !/[.!?]$/.test(firstLine) || /^chapter\b/i.test(firstLine) || /:$/.test(firstLine);
    if (!isCompact || !hasFewWords || !looksLikeHeading) {
      continue;
    }
    const baseId = slugifyHeading(firstLine) || `section-${items.length + 1}`;
    const duplicateIndex = seen.get(baseId) ?? 0;
    seen.set(baseId, duplicateIndex + 1);
    items.push({
      id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
      title: firstLine.replace(/:$/, ''),
      level: /^chapter\b/i.test(firstLine) ? 1 : 2,
      offset: match.index
    });
  }

  return items;
}

function parseTextOutline(input: string): TextOutlineItem[] {
  if (!input) {
    return [];
  }
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const lines = input.split('\n');
  let offset = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const title = match[2].trim();
      if (title) {
        const baseId = slugifyHeading(title) || `section-${items.length + 1}`;
        const duplicateIndex = seen.get(baseId) ?? 0;
        seen.set(baseId, duplicateIndex + 1);
        items.push({
          id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
          title,
          level,
          offset
        });
      }
    }
    offset += line.length + 1;
  }
  return items.length > 0 ? items : parseFallbackOutline(input);
}

export function useChapterTextOutline({
  chapterNumber,
  selectedVersionId,
  displayText,
  displayLoading,
  textViewerRef
}: {
  chapterNumber: number | null;
  selectedVersionId: string;
  displayText: string;
  displayLoading: boolean;
  textViewerRef: RefObject<HTMLDivElement | null>;
}) {
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const outlineItems = useMemo(() => parseTextOutline(displayText), [displayText]);
  const outlineByOffset = useMemo(() => new Map(outlineItems.map((item) => [item.offset, item])), [outlineItems]);

  useEffect(() => {
    setActiveOutlineId(outlineItems[0]?.id ?? null);
  }, [outlineItems]);

  useEffect(() => {
    setOutlineOpen(outlineItems.length > 0);
  }, [outlineItems.length]);

  const handleOutlineSelect = useCallback((id: string) => {
    setActiveOutlineId(id);
    const container = textViewerRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-outline-id="${id}"]`);
    if (!container || !target) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 24;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [textViewerRef]);

  useEffect(() => {
    return onFloatingAudioSubchapterSelect(({ subchapter, track }) => {
      if (typeof track.chapterNumber === 'number' && chapterNumber !== track.chapterNumber) {
        return;
      }
      if (track.versionId && selectedVersionId !== track.versionId) {
        return;
      }
      const requestedTitle = normalizeNavigationTitle(subchapter.title);
      if (!requestedTitle || displayLoading || !displayText || outlineItems.length === 0) {
        return;
      }
      const exactMatch = outlineItems.find((item) => normalizeNavigationTitle(item.title) === requestedTitle);
      const looseMatch =
        exactMatch ??
        outlineItems.find((item) => {
          const outlineTitle = normalizeNavigationTitle(item.title);
          return outlineTitle.includes(requestedTitle) || requestedTitle.includes(outlineTitle);
        });
      if (looseMatch) {
        handleOutlineSelect(looseMatch.id);
      }
    });
  }, [chapterNumber, displayLoading, displayText, handleOutlineSelect, outlineItems, selectedVersionId]);

  useEffect(() => {
    const container = textViewerRef.current;
    if (!container || outlineItems.length === 0) {
      return;
    }
    const updateActiveOutline = () => {
      const headings = [...container.querySelectorAll<HTMLElement>('[data-outline-id]')];
      if (headings.length === 0) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      let nextActiveId = headings[0]?.dataset.outlineId ?? null;
      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top - containerRect.top <= 96) {
          nextActiveId = heading.dataset.outlineId ?? nextActiveId;
        } else {
          break;
        }
      }
      setActiveOutlineId((current) => (current === nextActiveId ? current : nextActiveId));
    };

    updateActiveOutline();
    container.addEventListener('scroll', updateActiveOutline, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveOutline);
  }, [outlineItems, textViewerRef]);

  return {
    activeOutlineId,
    outlineItems,
    outlineByOffset,
    outlineOpen,
    setOutlineOpen,
    handleOutlineSelect
  };
}
