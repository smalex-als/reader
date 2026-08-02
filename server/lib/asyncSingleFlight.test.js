import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncSingleFlight } from './asyncSingleFlight.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test('AsyncSingleFlight never runs two tasks concurrently', async () => {
  const gate = new AsyncSingleFlight();
  const firstRelease = deferred();
  const order = [];
  let active = 0;
  let maxActive = 0;

  const first = gate.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('first-start');
    await firstRelease.promise;
    order.push('first-end');
    active -= 1;
  });
  const second = gate.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push('second-start');
    active -= 1;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['first-start']);
  firstRelease.resolve();
  await Promise.all([first, second]);

  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
});

test('AsyncSingleFlight skips an aborted task after the active task releases', async () => {
  const gate = new AsyncSingleFlight();
  const firstRelease = deferred();
  const controller = new AbortController();
  let abortedTaskStarted = false;
  let followingTaskStarted = false;

  const first = gate.run(() => firstRelease.promise);
  const aborted = gate.run(() => {
    abortedTaskStarted = true;
  }, controller.signal);
  const following = gate.run(() => {
    followingTaskStarted = true;
  });
  controller.abort();
  firstRelease.resolve();

  await first;
  await assert.rejects(aborted, { name: 'AbortError' });
  await following;
  assert.equal(abortedTaskStarted, false);
  assert.equal(followingTaskStarted, true);
});
