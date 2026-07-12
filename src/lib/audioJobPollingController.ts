export type AudioJobPollingScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

export type AudioJobPollContext = {
  isCurrent: () => boolean;
};

type AudioJobPoll = (
  chapterNumber: number,
  context: AudioJobPollContext
) => Promise<boolean>;

export class AudioJobPollingController {
  private readonly scheduler: AudioJobPollingScheduler;
  private readonly poll: AudioJobPoll;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly timers = new Map<number, unknown>();
  private readonly attempts = new Map<number, number>();
  private readonly versions = new Map<number, number>();
  private generation = 0;
  private mounted = false;
  private scope: string | null = null;

  constructor({
    scheduler,
    poll,
    initialDelayMs = 1000,
    maxDelayMs = 10000
  }: {
    scheduler: AudioJobPollingScheduler;
    poll: AudioJobPoll;
    initialDelayMs?: number;
    maxDelayMs?: number;
  }) {
    this.scheduler = scheduler;
    this.poll = poll;
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  private invalidateChapter(chapterNumber: number) {
    const timer = this.timers.get(chapterNumber);
    if (timer !== undefined) {
      this.scheduler.clearTimeout(timer);
    }
    this.timers.delete(chapterNumber);
    this.attempts.delete(chapterNumber);
    const version = (this.versions.get(chapterNumber) ?? 0) + 1;
    this.versions.set(chapterNumber, version);
    return version;
  }

  private isCurrent(chapterNumber: number, version: number, generation: number) {
    return this.mounted &&
      this.generation === generation &&
      this.versions.get(chapterNumber) === version;
  }

  private scheduleNext(chapterNumber: number, version: number, generation: number) {
    if (!this.isCurrent(chapterNumber, version, generation)) {
      return;
    }
    const attempt = (this.attempts.get(chapterNumber) ?? 0) + 1;
    this.attempts.set(chapterNumber, attempt);
    const delayMs = Math.min(
      this.initialDelayMs * 2 ** (attempt - 1),
      this.maxDelayMs
    );
    const timer = this.scheduler.setTimeout(() => {
      if (this.timers.get(chapterNumber) !== timer) {
        return;
      }
      this.timers.delete(chapterNumber);
      const context = {
        isCurrent: () => this.isCurrent(chapterNumber, version, generation)
      };
      void this.poll(chapterNumber, context).then(
        (shouldContinue) => {
          if (!context.isCurrent()) {
            return;
          }
          if (shouldContinue) {
            this.scheduleNext(chapterNumber, version, generation);
            return;
          }
          this.attempts.delete(chapterNumber);
        },
        () => {
          if (context.isCurrent()) {
            this.scheduleNext(chapterNumber, version, generation);
          }
        }
      );
    }, delayMs);
    this.timers.set(chapterNumber, timer);
  }

  mount() {
    this.mounted = true;
  }

  setScope(scope: string | null) {
    if (this.scope === scope) {
      return;
    }
    this.reset();
    this.scope = scope;
  }

  schedule(chapterNumber: number, scope: string) {
    if (scope !== this.scope) {
      return;
    }
    const version = this.invalidateChapter(chapterNumber);
    this.scheduleNext(chapterNumber, version, this.generation);
  }

  clear(chapterNumber: number) {
    this.invalidateChapter(chapterNumber);
  }

  reset() {
    this.generation += 1;
    this.timers.forEach((timer) => this.scheduler.clearTimeout(timer));
    this.timers.clear();
    this.attempts.clear();
    this.versions.clear();
  }

  dispose() {
    this.reset();
    this.mounted = false;
  }
}
