import { useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ReaderStateCard from '@/components/ReaderStateCard';
import { useComparisonText, useComparisonVersions } from '@/hooks/useComparisonVersions';
import { useDisplayedChapterText } from '@/hooks/useDisplayedChapterText';
import { getLinkedScrollTop, resolveComparisonVersion, type ComparisonSelection } from '@/lib/chapterComparison';
import { remarkLegacyCenteredHtml } from '@/lib/legacyMarkdown';
import { remarkListItemBreaks } from '@/lib/remarkListItemBreaks';
import { remarkMarkdownCommands } from '@/lib/remarkMarkdownCommands';

type Props = {
  bookId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  initialSelections: [ComparisonSelection, ComparisonSelection];
  onClose: () => void;
};

export default function ChapterComparisonView({
  bookId, chapterNumber, chapterTitle, initialSelections, onClose
}: Props) {
  const catalog = useComparisonVersions(bookId, chapterNumber);
  const [selections, setSelections] = useState(initialSelections);
  const [linked, setLinked] = useState(false);
  const [activeSide, setActiveSide] = useState<0 | 1>(1);
  const leftVersion = resolveComparisonVersion(selections[0], chapterNumber, catalog.versions);
  const rightVersion = resolveComparisonVersion(selections[1], chapterNumber, catalog.versions);
  const leftText = useComparisonText(leftVersion?.file);
  const rightText = useComparisonText(rightVersion?.file);
  const versions = [leftVersion, rightVersion];
  const texts = [leftText, rightText];
  const scrollRefs = useRef<Array<HTMLDivElement | null>>([null, null]);
  const expectedScroll = useRef<Array<number | null>>([null, null]);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    expectedScroll.current[0] = null;
    if (scrollRefs.current[0]) scrollRefs.current[0].scrollTop = 0;
  }, [chapterNumber, leftVersion?.file]);
  useLayoutEffect(() => {
    expectedScroll.current[1] = null;
    if (scrollRefs.current[1]) scrollRefs.current[1].scrollTop = 0;
  }, [chapterNumber, rightVersion?.file]);

  useDisplayedChapterText({
    chapterNumber,
    chapterTitle,
    displayText: texts[activeSide].text,
    selectedVersionId: versions[activeSide]?.id ?? '',
    selectedVersionLabel: versions[activeSide]?.label ?? null
  });

  const syncScroll = (side: number, source: HTMLDivElement) => {
    const targetSide = side === 0 ? 1 : 0;
    const target = scrollRefs.current[targetSide];
    if (!target || !source.clientHeight || !target.clientHeight) return;
    const top = getLinkedScrollTop(
      source.scrollTop, source.scrollHeight - source.clientHeight,
      target.scrollHeight - target.clientHeight
    );
    if (Math.abs(target.scrollTop - top) < 1) return;
    target.scrollTop = top;
    expectedScroll.current[targetSide] = target.scrollTop;
  };
  const handleScroll = (side: number, event: UIEvent<HTMLDivElement>) => {
    const source = event.currentTarget;
    const expected = expectedScroll.current[side];
    expectedScroll.current[side] = null;
    if (expected !== null && Math.abs(source.scrollTop - expected) < 1) return;
    if (linked) syncScroll(side, source);
  };

  return (
    <section className="chapter-comparison" aria-label="Compare chapter versions">
      <div className="chapter-comparison-toolbar">
        <div>
          <strong>Compare versions</strong>
          <p className="chapter-comparison-hint">Select a column to use its text with Listen.</p>
        </div>
        <label className="chapter-comparison-link">
          <input type="checkbox" checked={linked} onChange={(event) => {
            setLinked(event.target.checked);
            expectedScroll.current = [null, null];
            const source = scrollRefs.current[activeSide];
            if (event.target.checked && source) syncScroll(activeSide, source);
          }} />
          Link scrolling
          <span className="chapter-comparison-hint">By reading percentage</span>
        </label>
        <button ref={closeRef} type="button" className="button button-secondary" onClick={onClose}>
          Close comparison
        </button>
      </div>
      <div className="chapter-comparison-switch" role="group" aria-label="Visible comparison column">
        {([0, 1] as const).map((side) => (
          <button key={side} type="button" className="button button-secondary"
            aria-pressed={activeSide === side} onClick={() => setActiveSide(side)}>
            {side === 0 ? 'Left' : 'Right'}: {versions[side]?.promptName || versions[side]?.label || 'Choose version'}
          </button>
        ))}
      </div>
      {catalog.loading ? <ReaderStateCard tone="loading" title="Loading chapter versions" /> : catalog.error ? (
        <ReaderStateCard tone="error" title={catalog.error} action={{ label: 'Retry', onClick: catalog.retry }} />
      ) : (
        <div className="chapter-comparison-columns">
          {([0, 1] as const).map((side) => {
            const version = versions[side];
            const content = texts[side];
            const label = side === 0 ? 'Left' : 'Right';
            return (
              <section key={side} className="chapter-comparison-pane" data-active={activeSide === side}
                aria-label={`${label} version`} onFocusCapture={() => setActiveSide(side)}
                onPointerDown={() => setActiveSide(side)}>
                <header className="chapter-comparison-pane-header">
                  <label className="text-viewer-version-select">
                    <span>{label} version {activeSide === side ? '· Listen source' : ''}</span>
                    <select aria-label={`${label} version`} value={version?.id ?? ''} onChange={(event) => {
                      const next = catalog.versions.find((item) => item.id === event.target.value);
                      if (!next) return;
                      setSelections((current) => {
                        const updated: typeof current = [...current];
                        updated[side] = { chapterNumber, version: next };
                        return updated;
                      });
                    }}>
                      {!version ? <option value="" disabled>Choose a version</option> : null}
                      {catalog.versions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}{item.promptName ? ` · ${item.promptName}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </header>
                <div className="chapter-comparison-scroll" ref={(element) => { scrollRefs.current[side] = element; }}
                  tabIndex={0} role="region" aria-label={`${label} version text`}
                  onScroll={(event) => handleScroll(side, event)}
                  onKeyDown={(event) => {
                    // Keep page-scrolling keys local instead of navigating to another chapter.
                    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
                      event.stopPropagation();
                    }
                  }}>
                  {!version ? (
                    <ReaderStateCard title="Choose a version for this chapter"
                      description={`${selections[side].version.promptName || selections[side].version.label} has no unique match here. Select an available version above.`} />
                  ) : content.loading ? <ReaderStateCard tone="loading" title="Loading version" /> : content.error ? (
                    <ReaderStateCard tone="error" title={content.error} action={{ label: 'Retry', onClick: content.retry }} />
                  ) : !content.text ? <ReaderStateCard title="This version is empty" /> : (
                    <div className="text-viewer-markdown">
                      <ReactMarkdown remarkPlugins={[
                        remarkGfm, remarkLegacyCenteredHtml, remarkListItemBreaks, remarkMarkdownCommands
                      ]}>{content.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
