import assert from 'node:assert/strict';
import test from 'node:test';
import { getLinkedScrollTop, resolveComparisonVersion } from '../src/lib/chapterComparison.ts';
import type { ChapterTextVersion } from '../src/types/app.ts';

function version(id: string, promptId: string | null = null): ChapterTextVersion {
  return { id, kind: id === 'base' ? 'base' : 'derived', index: 1, label: 'Version 1',
    file: `/chapter1-${id}.txt`, filename: '', deletable: id !== 'base', promptId };
}

test('comparison keeps exact selection within a chapter and follows prompt across chapters', () => {
  const original = version('v1', 'translation');
  const summary = version('v1', 'summary');
  const translation = version('v2', 'translation');
  const selection = { chapterNumber: 1, version: original };
  assert.equal(resolveComparisonVersion(selection, 1, [original]), original);
  assert.equal(resolveComparisonVersion(selection, 2, [summary, translation]), translation);
  assert.equal(resolveComparisonVersion(selection, 2, [summary]), null);
  assert.equal(resolveComparisonVersion(selection, 1, [translation]), null);
});

test('missing or ambiguous versions require an explicit choice', () => {
  const original = version('v1', 'translation');
  assert.equal(resolveComparisonVersion({ chapterNumber: 1, version: original }, 2,
    [version('v1', 'translation'), version('v2', 'translation')]), null);
  assert.equal(resolveComparisonVersion({ chapterNumber: 1, version: version('v1') }, 2,
    [version('v1')]), null);
});

test('base matches across chapters; named versions match when unambiguous', () => {
  const base = version('base');
  assert.equal(resolveComparisonVersion({ chapterNumber: 1, version: base }, 2, [base]), base);
  const named = { ...version('v1'), promptName: 'Russian translation' };
  const match = { ...named, id: 'v3' };
  assert.equal(resolveComparisonVersion({ chapterNumber: 1, version: named }, 2, [match]), match);
});

test('linked scrolling accounts for different lengths, bounds, and non-scrollable content', () => {
  assert.equal(getLinkedScrollTop(500, 1000, 4000), 2000);
  assert.equal(getLinkedScrollTop(1000, 1000, 4000), 4000);
  assert.equal(getLinkedScrollTop(-20, 1000, 4000), 0);
  assert.equal(getLinkedScrollTop(1200, 1000, 4000), 4000);
  assert.equal(getLinkedScrollTop(100, 0, 4000), 0);
  assert.equal(getLinkedScrollTop(100, 1000, 0), 0);
});
