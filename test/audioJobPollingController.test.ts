import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AudioJobPollingController,
  type AudioJobPollingScheduler
} from '../src/lib/audioJobPollingController.ts';

function createScheduler() {
  let nextId = 1;
  const scheduled = new Map<number, { callback: () => void; delayMs: number }>();
  const cleared: number[] = [];
  const scheduler: AudioJobPollingScheduler = {
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      scheduled.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout: (timer) => {
      const id = timer as number;
      scheduled.delete(id);
      cleared.push(id);
    }
  };
  return {
    scheduler,
    get delays() {
      return [...scheduled.values()].map(({ delayMs }) => delayMs);
    },
    get size() {
      return scheduled.size;
    },
    get cleared() {
      return cleared.length;
    },
    async runNext() {
      const entry = scheduled.entries().next().value as
        | [number, { callback: () => void; delayMs: number }]
        | undefined;
      if (!entry) {
        return;
      }
      scheduled.delete(entry[0]);
      entry[1].callback();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test('audio job polling backs off until the poll reports completion', async () => {
  const timers = createScheduler();
  let polls = 0;
  const controller = new AudioJobPollingController({
    scheduler: timers.scheduler,
    poll: async () => {
      polls += 1;
      return polls < 4;
    }
  });

  controller.mount();
  controller.setScope('book-a');
  controller.schedule(7, 'book-a');
  assert.deepEqual(timers.delays, [1000]);
  await timers.runNext();
  assert.deepEqual(timers.delays, [2000]);
  await timers.runNext();
  assert.deepEqual(timers.delays, [4000]);
  await timers.runNext();
  assert.deepEqual(timers.delays, [8000]);
  await timers.runNext();
  assert.equal(polls, 4);
  assert.equal(timers.size, 0);
});

test('clearing a chapter invalidates an in-flight poll result', async () => {
  const timers = createScheduler();
  let resolvePoll: ((value: boolean) => void) | undefined;
  let isCurrent: (() => boolean) | undefined;
  const controller = new AudioJobPollingController({
    scheduler: timers.scheduler,
    poll: (_chapterNumber, context) => {
      isCurrent = context.isCurrent;
      return new Promise<boolean>((resolve) => {
        resolvePoll = resolve;
      });
    }
  });

  controller.mount();
  controller.setScope('book-a');
  controller.schedule(3, 'book-a');
  const running = timers.runNext();
  controller.clear(3);
  resolvePoll?.(true);
  await running;

  assert.equal(isCurrent?.(), false);
  assert.equal(timers.size, 0);
});

test('reset drops timers from the previous book and dispose supports Strict Mode remount', async () => {
  const timers = createScheduler();
  let polls = 0;
  const controller = new AudioJobPollingController({
    scheduler: timers.scheduler,
    poll: async () => {
      polls += 1;
      return false;
    }
  });

  controller.mount();
  controller.setScope('book-a');
  controller.schedule(1, 'book-a');
  controller.schedule(2, 'book-a');
  controller.setScope('book-b');
  assert.equal(timers.size, 0);
  assert.equal(timers.cleared, 2);

  controller.schedule(3, 'book-a');
  assert.equal(timers.size, 0);

  controller.dispose();
  controller.schedule(3, 'book-b');
  assert.equal(timers.size, 0);

  controller.mount();
  controller.schedule(3, 'book-b');
  await timers.runNext();
  assert.equal(polls, 1);
});
