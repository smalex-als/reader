import assert from 'node:assert/strict';
import test from 'node:test';
import * as clientStreamText from '../src/lib/streamText.ts';
import * as serverStreamText from '../server/lib/streamText.js';

const SPEECH_FIXTURES = [
  '# 2.1 API Overview\n\nPOST /v1/audio_stream with {"voice_id": "voice_v2"}',
  'Temperature is $20^{\\circ}C$ and the range is \\(\\frac{1}{2} \\times 8\\).',
  '**Fast path** 🚀 works — see [the guide](https://example.com/docs).',
  [
    '<|ref|>text<|/ref|><|det|>[[0, 0, 10, 10]]<|/det|>',
    '<|speech_removed|>Skip this block<|/speech_removed|>',
    '<|ref|>text<|/ref|><|det|>[[0, 11, 10, 20]]<|/det|>',
    'Keep this block'
  ].join('\n')
];

test('client and server speech cleanup use identical canonical behavior', () => {
  for (const fixture of SPEECH_FIXTURES) {
    assert.equal(clientStreamText.stripMarkdown(fixture), serverStreamText.stripMarkdown(fixture));
  }
  assert.equal(clientStreamText.stripMarkdown(SPEECH_FIXTURES[3]), 'Keep this block');
});

test('client and server stream chunking preserve identical boundaries', () => {
  const input = [
    'A short opening sentence.',
    'The quoted sentence finishes here.” Another sentence follows with enough text to cross a small chunk boundary.',
    'Final paragraph.'
  ].join('\n\n');
  const options = [input, 0, 45, 30] as const;

  assert.deepEqual(
    clientStreamText.splitStreamChunks(...options),
    serverStreamText.splitStreamChunks(...options)
  );
  assert.ok(clientStreamText.splitStreamChunks(...options).some((chunk) => chunk.endsWith('.”')));
});

test('client and server fenced-code and paragraph helpers stay in parity', () => {
  const fenced = 'Before\n```text\nSpoken example\n```\n```js\nconst hidden = true;\n```\nAfter';
  assert.equal(
    clientStreamText.normalizeFencedCodeBlocksForSpeech(fenced),
    serverStreamText.normalizeFencedCodeBlocksForSpeech(fenced)
  );

  const paragraphs = `${'First paragraph. '.repeat(80)}\n\nSecond paragraph.`;
  assert.deepEqual(
    clientStreamText.splitStreamParagraphChunks(paragraphs, 0),
    serverStreamText.splitStreamParagraphChunks(paragraphs, 0)
  );
});
