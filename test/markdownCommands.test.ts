import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseMarkdownCommandLine,
  parsePauseDurationMs,
  resolveMarkdownCommandLines,
  removeSkippedRegions
} from '../shared/markdownCommandsCore.js';
import { stripMarkdown } from '../shared/streamTextCore.js';

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

  assert.equal(resolveMarkdownCommandLines(input), 'First paragraph.\n\n\n\nSecond paragraph.');
});

test('keeps command-looking lines that are part of a surrounding paragraph', () => {
  const input = 'First line.\n::pause 2s\nSecond line.';
  assert.equal(resolveMarkdownCommandLines(input), input);
});

test('parses the skip, stop and voice commands', () => {
  assert.deepEqual(parseMarkdownCommandLine('::skip'), { name: 'skip' });
  assert.deepEqual(parseMarkdownCommandLine('::skip-end'), { name: 'skip-end' });
  assert.deepEqual(parseMarkdownCommandLine('::stop'), { name: 'stop' });
  assert.deepEqual(parseMarkdownCommandLine('::voice mike'), { name: 'voice', voice: 'mike' });
});

test('a bare voice command means "back to the default voice"', () => {
  assert.deepEqual(parseMarkdownCommandLine('::voice'), { name: 'voice', voice: null });
});

test('removes a skip region together with its markers', () => {
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

  const output = removeSkippedRegions(input);
  assert.ok(!output.includes('A table nobody'));
  assert.ok(!output.includes('::skip'));
  assert.ok(output.includes('Spoken intro.'));
  assert.ok(output.includes('Spoken outro.'));
});

test('an unterminated skip region runs to the end of the text', () => {
  const input = 'Spoken intro.\n\n::skip\n\nEverything after this is silent.';

  const output = removeSkippedRegions(input);
  assert.ok(output.includes('Spoken intro.'));
  assert.ok(!output.includes('Everything after'));
});

test('stripMarkdown drops skipped regions and command markers together', () => {
  const input = 'Intro.\n\n::skip\n\nHidden from speech.\n\n::skip-end\n\n::note aside\n\nOutro.';

  const output = stripMarkdown(input);
  assert.equal(output, 'Intro.\n\nOutro.');
});

test('parses a say command', () => {
  assert.deepEqual(parseMarkdownCommandLine('::say A table of yields follows.'), {
    name: 'say',
    text: 'A table of yields follows.'
  });
});

test('say text replaces the marker for text-level speech pipelines', () => {
  const input = 'Intro.\n\n::say A table of yields follows.\n\nOutro.';

  assert.equal(
    resolveMarkdownCommandLines(input),
    'Intro.\n\nA table of yields follows.\n\nOutro.'
  );
});

test('a say inside a skip region survives the region', () => {
  const input = [
    'Intro.',
    '',
    '::skip',
    '',
    '| Year | Yield |',
    '',
    '::say A table of yields follows.',
    '',
    '::skip-end',
    '',
    'Outro.'
  ].join('\n');

  const output = stripMarkdown(input);
  assert.equal(output, 'Intro.\n\nA table of yields follows.\n\nOutro.');
});

test('an empty say command leaves nothing behind', () => {
  assert.equal(resolveMarkdownCommandLines('Intro.\n\n::say\n\nOutro.'), 'Intro.\n\n\nOutro.');
});
