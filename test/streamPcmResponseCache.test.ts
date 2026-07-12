import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStreamPcmResponseKey,
  StreamPcmResponseCache
} from '../src/lib/streamPcmResponseCache.ts';

test('frontend PCM response keys depend only on spoken input and voice', () => {
  assert.equal(
    getStreamPcmResponseKey('same block', 'voice-a'),
    getStreamPcmResponseKey('same block', 'voice-a')
  );
  assert.notEqual(
    getStreamPcmResponseKey('same block', 'voice-a'),
    getStreamPcmResponseKey('same block', 'voice-b')
  );
});

test('frontend PCM response cache deduplicates pending work', async () => {
  const cache = new StreamPcmResponseCache(2, 8);
  let resolveRequest!: (value: Uint8Array) => void;
  const request = new Promise<Uint8Array>((resolve) => {
    resolveRequest = resolve;
  });
  const tracked = cache.track('block', request);

  assert.equal(cache.getPending('block'), tracked);
  resolveRequest(new Uint8Array([1, 2]));
  assert.deepEqual(await tracked, new Uint8Array([1, 2]));
  assert.deepEqual(cache.get('block'), new Uint8Array([1, 2]));
  assert.equal(cache.getPending('block'), null);
});

test('frontend PCM response cache evicts least recently used audio by size', async () => {
  const cache = new StreamPcmResponseCache(3, 4);
  await cache.track('first', Promise.resolve(new Uint8Array([1, 2])));
  await cache.track('second', Promise.resolve(new Uint8Array([3, 4])));
  cache.get('first');
  await cache.track('third', Promise.resolve(new Uint8Array([5, 6])));

  assert.equal(cache.get('second'), null);
  assert.deepEqual(cache.get('first'), new Uint8Array([1, 2]));
  assert.deepEqual(cache.get('third'), new Uint8Array([5, 6]));
});
