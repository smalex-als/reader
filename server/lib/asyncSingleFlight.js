function createAbortError() {
  const error = new Error('Operation aborted while waiting for the active task');
  error.name = 'AbortError';
  return error;
}

export class AsyncSingleFlight {
  #tail = Promise.resolve();

  async run(task, signal) {
    const previous = this.#tail.catch(() => {});
    let release;
    const turn = new Promise((resolve) => {
      release = resolve;
    });
    this.#tail = previous.then(() => turn);

    await previous;
    if (signal?.aborted) {
      release();
      throw createAbortError();
    }

    try {
      return await task();
    } finally {
      release();
    }
  }
}
