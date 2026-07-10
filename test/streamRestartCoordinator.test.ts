import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamRestartCoordinator } from '../src/lib/streamRestartCoordinator.ts';

function createScheduler() {
  let scheduled: (() => void) | null = null;
  let cleared = 0;
  return {
    scheduler: {
      setTimeout: (callback: () => void) => {
        scheduled = callback;
        return callback;
      },
      clearTimeout: () => {
        scheduled = null;
        cleared += 1;
      }
    },
    run: () => {
      const callback = scheduled;
      scheduled = null;
      callback?.();
    },
    get cleared() {
      return cleared;
    }
  };
}

test('restart coordinator consumes an idle sequence restart after the delay boundary', () => {
  const timers = createScheduler();
  const coordinator = new StreamRestartCoordinator(timers.scheduler, 120);
  let status = 'idle';
  let pending = {
    kind: 'sequence' as const,
    value: {
      fullText: 'chapter',
      startIndex: 4,
      baseKey: 'chapter-1',
      source: 'chapter' as const
    }
  };
  let consumed = 0;
  let startedAt = -1;

  coordinator.sync({
    getStatus: () => status,
    getPending: () => pending,
    consume: () => {
      consumed += 1;
    },
    startSequence: (value) => {
      startedAt = value.startIndex;
    },
    startSingle: () => {}
  });
  timers.run();

  assert.equal(consumed, 1);
  assert.equal(startedAt, 4);
  status = 'streaming';
});

test('restart coordinator ignores stale work and cancels scheduled timers on dispose', () => {
  const timers = createScheduler();
  const coordinator = new StreamRestartCoordinator(timers.scheduler, 120);
  let status = 'idle';
  const pending = {
    kind: 'single' as const,
    value: { text: 'hello', pageKey: 'page-1' }
  };
  let starts = 0;
  const options = {
    getStatus: () => status,
    getPending: () => pending,
    consume: () => {},
    startSequence: () => {},
    startSingle: () => {
      starts += 1;
    }
  };

  coordinator.sync(options);
  status = 'streaming';
  timers.run();
  assert.equal(starts, 0);

  status = 'idle';
  coordinator.sync(options);
  coordinator.dispose();
  timers.run();
  assert.equal(starts, 0);
  assert.equal(timers.cleared, 1);
});
