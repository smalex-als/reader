import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { onFloatingAudioSubchapterSelect } from '@/lib/floatingAudioEvents';
import { normalizeOutlineTitle, parseTextOutline } from '@/lib/chapterTextOutline';

function normalizeNavigationTitle(input: string) {
  return normalizeOutlineTitle(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlineItems = useMemo(() => parseTextOutline(displayText), [displayText]);
  const outlineByOffset = useMemo(() => new Map(outlineItems.map((item) => [item.offset, item])), [outlineItems]);

  useEffect(() => {
    setActiveOutlineId(outlineItems[0]?.id ?? null);
  }, [outlineItems]);

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
