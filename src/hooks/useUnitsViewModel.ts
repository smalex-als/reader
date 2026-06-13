import { useEffect, useMemo, type CSSProperties } from 'react';
import { getUnitTopicText } from '@/lib/unitTopicText';
import type { UnitItem, UnitSet } from '@/types/app';

export function useUnitsViewModel({
  items,
  loadItems,
  query,
  refreshToken,
  selectedSetId,
  selectedTopicId,
  textFontSize
}: {
  items: UnitSet[];
  loadItems: () => Promise<void>;
  query: string;
  refreshToken: number;
  selectedSetId: string | null;
  selectedTopicId: string | null;
  textFontSize: number;
}) {
  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshToken]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) =>
      [
        item.title,
        item.summary,
        item.sourceBookId,
        item.sourceChapterTitle,
        item.sourceVersionId,
        item.source,
        ...item.units.flatMap((unit) => [unit.title, unit.summary, unit.learningGoal])
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [items, query]);

  const selectedSet = useMemo(
    () => items.find((item) => item.id === selectedSetId) ?? null,
    [items, selectedSetId]
  );
  const selectedUnit = useMemo<UnitItem | null>(() => {
    if (!selectedSet) {
      return null;
    }
    return selectedSet.units.find((unit) => unit.id === selectedTopicId) ?? null;
  }, [selectedSet, selectedTopicId]);
  const { topicText, topicSpeechText } = useMemo(
    () => (selectedUnit ? getUnitTopicText(selectedUnit) : { topicText: '', topicSpeechText: '' }),
    [selectedUnit]
  );
  const textStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );

  return {
    filteredItems,
    selectedSet,
    selectedUnit,
    textStyle,
    topicSpeechText,
    topicText
  };
}
