export class StreamStudyReplayGuard {
  private waitingForIdle = false;

  blockUntilIdle() {
    this.waitingForIdle = true;
  }

  allowPlayback() {
    this.waitingForIdle = false;
  }

  shouldSync(status: string) {
    if (!this.waitingForIdle) {
      return true;
    }
    if (status === 'idle') {
      this.waitingForIdle = false;
    }
    return false;
  }
}
