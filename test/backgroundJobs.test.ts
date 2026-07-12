import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedisConnectionOptions } from '../server/lib/backgroundJobs.js';

test('parses Redis connection URLs for BullMQ', () => {
  assert.deepEqual(
    createRedisConnectionOptions('redis://worker:secret@redis.internal:6380/3'),
    {
      host: 'redis.internal',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 3,
      maxRetriesPerRequest: 1
    }
  );
});

test('enables TLS for rediss connections and rejects unsupported protocols', () => {
  const connection = createRedisConnectionOptions('rediss://cache.example.com');
  assert.deepEqual(connection.tls, {});
  assert.equal(
    createRedisConnectionOptions('redis://cache.example.com', { workerConnection: true })
      .maxRetriesPerRequest,
    null
  );
  assert.throws(
    () => createRedisConnectionOptions('http://cache.example.com'),
    /redis:\/\/ or rediss:\/\//
  );
});
