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
const { resolveVoiceCommandId } = await import('../src/lib/streamVoiceCommands.ts');

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

const VOICE_OPTIONS = [
  { id: 'en-Mike_man', label: 'Mike', provider: 'streaming' },
  { id: 'en-Sara_woman', label: 'Sara', provider: 'streaming' }
];

const options = {
  resolveVoice: (name) => resolveVoiceCommandId(name, VOICE_OPTIONS)
};

test('a skip region is rendered text but never spoken', () => {
  const input = [
    'Spoken intro.',
    '',
    '::skip',
    '',
    'A table nobody wants read aloud.',
    '',
    '::skip-end',
    '',
    'Spoken outro.'
  ].join('\n');

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), ['Spoken intro.', 'Spoken outro.']);
});

test('an unterminated skip region silences the rest of the chapter', () => {
  const input = 'Spoken intro.\n\n::skip\n\nSilent tail.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), ['Spoken intro.']);
});

test('a voice command applies to every following segment', () => {
  const input = 'Narrator line.\n\n::voice sara\n\nHer line.\n\nStill her line.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1', options);

  assert.deepEqual(segments.map((segment) => segment.voice), [
    undefined,
    'en-Sara_woman',
    'en-Sara_woman'
  ]);
});

test('a bare voice command returns to the session voice', () => {
  const input = '::voice sara\n\nHer line.\n\n::voice\n\nNarrator again.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1', options);

  assert.deepEqual(segments.map((segment) => segment.voice), ['en-Sara_woman', undefined]);
});

test('an unknown voice name leaves the voice untouched', () => {
  const input = '::voice nobody\n\nA line.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1', options);

  assert.equal(segments[0].voice, undefined);
});

test('starting mid-chapter inherits the voice set earlier in the text', () => {
  const input = 'Narrator line.\n\n::voice sara\n\nHer line.\n\nStill her line.';
  const startIndex = input.indexOf('Still her line.');

  const segments = createParagraphStreamSegments(input, startIndex, 'chapter-1', options);

  assert.deepEqual(segments.map((segment) => segment.text), ['Still her line.']);
  assert.equal(segments[0].voice, 'en-Sara_woman');
});

test('starting inside a skip region stays silent', () => {
  const input = 'Intro.\n\n::skip\n\nHidden one.\n\nHidden two.\n\n::skip-end\n\nOutro.';
  const startIndex = input.indexOf('Hidden two.');

  const segments = createParagraphStreamSegments(input, startIndex, 'chapter-1');

  assert.deepEqual(segments.map((segment) => segment.text), ['Outro.']);
});

test('a stop command marks the preceding segment as a breakpoint', () => {
  const input = 'First block.\n\n::stop\n\nSecond block.';

  const segments = createParagraphStreamSegments(input, 0, 'chapter-1');

  assert.equal(segments[0].stopAfter, true);
  assert.equal(segments[1].stopAfter, undefined);
  assert.deepEqual(segments.map((segment) => segment.text), ['First block.', 'Second block.']);
});
