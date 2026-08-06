import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const sourcePath = `../src/${specifier.slice(2)}.ts`;
      return nextResolve(new URL(sourcePath, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const { createParagraphStreamSegments } = await import('../src/lib/streamSequenceSegments.ts');

test('a pause command lengthens the gap after the preceding segment', () => {
  const input = 'First paragraph.\n\n::pause 2s\n\nSecond paragraph.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), [
    'First paragraph.',
    'Second paragraph.'
  ]);
  assert.equal(segments[0].pauseAfterMs, 2000);
  assert.equal(segments[1].pauseAfterMs, undefined);
});

test('consecutive pause commands accumulate onto one gap', () => {
  const input = 'First paragraph.\n\n::pause 2s\n\n::pause 500ms\n\nSecond paragraph.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.equal(segments.length, 2);
  assert.equal(segments[0].pauseAfterMs, 2500);
});

test('note commands are never spoken', () => {
  const input = 'First paragraph.\n\n::note verify against page 114\n\nSecond paragraph.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), [
    'First paragraph.',
    'Second paragraph.'
  ]);
  assert.ok(segments.every((segment) => !segment.text.includes('verify against page 114')));
});

test('a pause before any spoken text is ignored', () => {
  const input = '::pause 2s\n\nOnly paragraph.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), ['Only paragraph.']);
  assert.equal(segments[0].pauseAfterMs, undefined);
});

test('paragraph page keys still point at the raw source offsets', () => {
  const input = 'First paragraph.\n\n::pause 2s\n\nSecond paragraph.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.pageKey), [
    'chapter::paragraph-start-0',
    `chapter::paragraph-start-${input.indexOf('Second')}`
  ]);
});
