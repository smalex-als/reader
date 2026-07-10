import type { StreamSequencePendingRestart } from '@/lib/streamSequenceMachine';

export type RestartTimerScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

export class StreamRestartCoordinator {
  private timer: unknown = null;
  private readonly scheduler: RestartTimerScheduler;
  private readonly delayMs: number;

  constructor(scheduler: RestartTimerScheduler, delayMs: number) {
    this.scheduler = scheduler;
    this.delayMs = delayMs;
  }

  clear() {
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  sync(options: {
    getStatus: () => string;
    getPending: () => StreamSequencePendingRestart | null;
    consume: () => void;
    startSequence: (pending: Extract<StreamSequencePendingRestart, { kind: 'sequence' }>['value']) => void;
    startSingle: (pending: Extract<StreamSequencePendingRestart, { kind: 'single' }>['value']) => void;
  }) {
    this.clear();
    if (options.getStatus() !== 'idle' || !options.getPending()) {
      return;
    }
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      const pending = options.getPending();
      if (options.getStatus() !== 'idle' || !pending) {
        return;
      }
      options.consume();
      if (pending.kind === 'sequence') {
        options.startSequence(pending.value);
        return;
      }
      options.startSingle(pending.value);
    }, this.delayMs);
  }

  dispose() {
    this.clear();
  }
}
