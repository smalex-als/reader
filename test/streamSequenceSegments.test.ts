import assert from 'node:assert/strict';
import test from 'node:test';
import { splitMarkdownPlaybackBlocks } from '../src/lib/markdownPlaybackBlocks.ts';

test('splits consecutive Markdown list items into separate playback blocks', () => {
  const input = [
    '1. First comparison. **Pattern:** first',
    '2. Second comparison. **Pattern:** second',
    '3. Third comparison. **Pattern:** third'
  ].join('\n');

  const blocks = splitMarkdownPlaybackBlocks(input);
  assert.deepEqual(blocks, [
    { rawText: '1. First comparison. **Pattern:** first', startIndex: 0 },
    {
      rawText: '2. Second comparison. **Pattern:** second',
      startIndex: input.indexOf('2. Second')
    },
    {
      rawText: '3. Third comparison. **Pattern:** third',
      startIndex: input.indexOf('3. Third')
    }
  ]);
});

test('keeps indented list-item continuation lines in their item', () => {
  const input = [
    '- A list item that wraps in the source',
    '  and continues on the next line',
    '- The next item'
  ].join('\n');

  assert.deepEqual(splitMarkdownPlaybackBlocks(input), [
    {
      rawText: '- A list item that wraps in the source\n  and continues on the next line',
      startIndex: 0
    },
    { rawText: '- The next item', startIndex: input.indexOf('- The next') }
  ]);
});

test('keeps lazy continuation lines in their Markdown list item', () => {
  const input = [
    '1. A list item',
    'continued without indentation',
    '2. The next item'
  ].join('\n');

  assert.deepEqual(splitMarkdownPlaybackBlocks(input), [
    {
      rawText: '1. A list item\ncontinued without indentation',
      startIndex: 0
    },
    { rawText: '2. The next item', startIndex: input.indexOf('2. The next') }
  ]);
});

test('keeps regular Markdown paragraphs as paragraph playback blocks', () => {
  const input = [
    'A paragraph that wraps',
    'onto a second source line.',
    '',
    'The next paragraph.'
  ].join('\n');

  assert.deepEqual(splitMarkdownPlaybackBlocks(input), [
    {
      rawText: 'A paragraph that wraps\nonto a second source line.',
      startIndex: 0
    },
    {
      rawText: 'The next paragraph.',
      startIndex: input.indexOf('The next')
    }
  ]);
});

test('treats a standalone command line as its own playback block', () => {
  const input = [
    'First paragraph.',
    '',
    '::pause 2s',
    '',
    '::note verify against page 114',
    '',
    'Second paragraph.'
  ].join('\n');

  assert.deepEqual(splitMarkdownPlaybackBlocks(input), [
    { rawText: 'First paragraph.', startIndex: 0 },
    {
      rawText: '::pause 2s',
      startIndex: input.indexOf('::pause'),
      command: { name: 'pause', durationMs: 2000 }
    },
    {
      rawText: '::note verify against page 114',
      startIndex: input.indexOf('::note'),
      command: { name: 'note', text: 'verify against page 114' }
    },
    { rawText: 'Second paragraph.', startIndex: input.indexOf('Second') }
  ]);
});

test('keeps a command-looking line inside its surrounding paragraph', () => {
  const input = 'First line.\n::pause 2s\nSecond line.';

  assert.deepEqual(splitMarkdownPlaybackBlocks(input), [
    { rawText: 'First line.\n::pause 2s\nSecond line.', startIndex: 0 }
  ]);
});
