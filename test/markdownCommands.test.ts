import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMarkdownCommandLine,
  parsePauseDurationMs,
  removeMarkdownCommandLines
} from '../shared/markdownCommandsCore.js';

test('parses pause durations in seconds, milliseconds and bare numbers', () => {
  assert.deepEqual(parseMarkdownCommandLine('::pause 2s'), { name: 'pause', durationMs: 2000 });
  assert.deepEqual(parseMarkdownCommandLine('::pause 1.5s'), { name: 'pause', durationMs: 1500 });
  assert.deepEqual(parseMarkdownCommandLine('::pause 500ms'), { name: 'pause', durationMs: 500 });
  assert.deepEqual(parseMarkdownCommandLine('::pause 3'), { name: 'pause', durationMs: 3000 });
});

test('falls back to the default duration for a missing or unreadable argument', () => {
  assert.deepEqual(parseMarkdownCommandLine('::pause'), { name: 'pause', durationMs: 1000 });
  assert.deepEqual(parseMarkdownCommandLine('::pause soon'), { name: 'pause', durationMs: 1000 });
});

test('clamps pause durations to the supported range', () => {
  assert.equal(parsePauseDurationMs('600s'), 30000);
  assert.equal(parsePauseDurationMs('0s'), 0);
});

test('parses notes and treats comment as an alias', () => {
  assert.deepEqual(parseMarkdownCommandLine('::note check this figure'), {
    name: 'note',
    text: 'check this figure'
  });
  assert.deepEqual(parseMarkdownCommandLine('::comment check this figure'), {
    name: 'note',
    text: 'check this figure'
  });
});

test('ignores text that is not a known command', () => {
  assert.equal(parseMarkdownCommandLine('::unknown do a thing'), null);
  assert.equal(parseMarkdownCommandLine(':::pause 2s'), null);
  assert.equal(parseMarkdownCommandLine('Ratios are 3::pause'), null);
  assert.equal(parseMarkdownCommandLine('The pause was long'), null);
});

test('tolerates carriage returns and leading indentation', () => {
  assert.deepEqual(parseMarkdownCommandLine('  ::pause 2s\r'), { name: 'pause', durationMs: 2000 });
});

test('removes standalone command lines from speech text', () => {
  const input = [
    'First paragraph.',
    '',
    '::pause 2s',
    '',
    '::note verify against page 114',
    '',
    'Second paragraph.'
  ].join('\n');

  assert.equal(removeMarkdownCommandLines(input), 'First paragraph.\n\n\n\nSecond paragraph.');
});

test('keeps command-looking lines that are part of a surrounding paragraph', () => {
  const input = 'First line.\n::pause 2s\nSecond line.';
  assert.equal(removeMarkdownCommandLines(input), input);
});
