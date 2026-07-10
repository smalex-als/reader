import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Pcm16Decoder,
  StreamAudioQueue,
  StreamPcmCache
} from '../src/lib/streamingPcm.ts';

test('PCM decoder preserves odd-byte boundaries between network chunks', () => {
  const decoder = new Pcm16Decoder();
  assert.equal(decoder.decode(new Uint8Array([0x00])), null);

  const decoded = decoder.decode(new Uint8Array([0x40, 0x00, 0xc0]));
  assert.ok(decoded);
  assert.equal(decoded.length, 2);
  assert.equal(decoded[0], 0.5);
  assert.equal(decoded[1], -0.5);
});

test('PCM cache copies buffers and evicts the least recently used segment', () => {
  const cache = new StreamPcmCache(2);
  const first = new Float32Array([0.25]);
  cache.set('first', [{ samples: first, pageKey: 'page-1' }]);
  cache.set('second', [{ samples: new Float32Array([0.5]), pageKey: 'page-2' }]);
  first[0] = 1;

  const cachedFirst = cache.get('first');
  assert.equal(cachedFirst?.[0].samples[0], 0.25);
  cachedFirst![0].samples[0] = 0;
  assert.equal(cache.get('first')?.[0].samples[0], 0.25);

  cache.set('third', [{ samples: new Float32Array([0.75]), pageKey: 'page-3' }]);
  assert.equal(cache.has('second'), false);
  assert.equal(cache.has('first'), true);
  assert.equal(cache.has('third'), true);
});

test('stream audio queue preserves FIFO order and clears pending work', () => {
  const queue = new StreamAudioQueue();
  queue.enqueue({ text: 'first', pageKey: 'page-1', voice: 'voice', pauseAfterMs: 0 });
  queue.enqueue({ text: 'second', pageKey: 'page-2', voice: 'voice', pauseAfterMs: 100 });

  assert.equal(queue.dequeue()?.pageKey, 'page-1');
  assert.equal(queue.size, 1);
  queue.clear();
  assert.equal(queue.size, 0);
  assert.equal(queue.dequeue(), null);
});
