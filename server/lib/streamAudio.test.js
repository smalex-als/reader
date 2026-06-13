import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { setImmediate as waitImmediate } from 'node:timers/promises';
import { createBufferedPcmStream } from './streamAudio.js';
import { splitTextForStreaming } from './streamAudioText.js';

test('secondary stream splitting preserves word boundaries with collapsed whitespace', () => {
  const input = Array.from({ length: 180 }, (_, index) => `word${index}`).join('  \n');

  const chunks = splitTextForStreaming(input);
  const normalizedInput = input.split(/\s+/).filter(Boolean).join(' ');
  const normalizedOutput = chunks.join(' ').split(/\s+/).filter(Boolean).join(' ');

  assert.ok(chunks.length > 1);
  assert.equal(normalizedOutput, normalizedInput);
  assert.ok(chunks.every((chunk) => /^word\d+/.test(chunk)));
});

async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

test('initial pcm buffer waits until target bytes before flushing', async () => {
  const source = new PassThrough();
  const buffered = createBufferedPcmStream(source, { initialBufferBytes: 10 });
  let dataEvents = 0;
  buffered.on('data', () => {
    dataEvents += 1;
  });

  source.write(Buffer.alloc(4, 1));
  source.write(Buffer.alloc(5, 2));
  await waitImmediate();
  assert.equal(dataEvents, 0);

  const flushed = once(buffered, 'data');
  source.write(Buffer.alloc(1, 3));
  await flushed;
  source.end();
  await once(buffered, 'end');
  assert.ok(dataEvents > 0);
});

test('initial pcm buffer flushes short streams on end', async () => {
  const source = new PassThrough();
  const buffered = createBufferedPcmStream(source, { initialBufferBytes: 10 });
  const collected = collectStream(buffered);

  source.write(Buffer.from([1, 2, 3]));
  await waitImmediate();
  source.end(Buffer.from([4, 5]));

  assert.deepEqual([...(await collected)], [1, 2, 3, 4, 5]);
});
