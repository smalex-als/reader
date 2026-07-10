import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from './index.js';

test('rejects nested multipart field names', async (t) => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  }));

  const address = server.address();
  assert(address && typeof address === 'object');

  const formData = new FormData();
  formData.append('book[name]', 'nested');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/upload/pdf`, {
    method: 'POST',
    body: formData
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /nesting/i);
});
