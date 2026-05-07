class StreamPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.activePageKey = null;
    this.trimAfterPageKey = null;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data.type !== 'string') {
        return;
      }
      if (data.type === 'append' && data.payload instanceof ArrayBuffer) {
        const pageKey = typeof data.pageKey === 'string' ? data.pageKey : null;
        if (this.trimAfterPageKey && pageKey !== this.trimAfterPageKey) {
          this.port.postMessage({ type: 'trimmed', samples: new Float32Array(data.payload).length });
          return;
        }
        this.chunks.push({
          samples: new Float32Array(data.payload),
          pageKey,
          offset: 0
        });
      } else if (data.type === 'reset') {
        this.chunks = [];
        this.activePageKey = null;
        this.trimAfterPageKey = null;
      } else if (data.type === 'trim-after-page-key' && typeof data.pageKey === 'string') {
        this.trimAfterPageKey = data.pageKey;
        let trimmedSamples = 0;
        this.chunks = this.chunks.filter((chunk) => {
          if (chunk.pageKey === data.pageKey) {
            return true;
          }
          trimmedSamples += Math.max(0, chunk.samples.length - chunk.offset);
          return false;
        });
        if (trimmedSamples > 0) {
          this.port.postMessage({ type: 'trimmed', samples: trimmedSamples });
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) {
      return true;
    }
    const frames = output.length;
    let silent = false;
    let writeOffset = 0;
    let activePageKey = null;

    while (writeOffset < frames && this.chunks.length > 0) {
      const chunk = this.chunks[0];
      const remaining = chunk.samples.length - chunk.offset;
      if (remaining <= 0) {
        this.chunks.shift();
        continue;
      }
      const take = Math.min(frames - writeOffset, remaining);
      output.set(chunk.samples.subarray(chunk.offset, chunk.offset + take), writeOffset);
      if (activePageKey === null && chunk.pageKey) {
        activePageKey = chunk.pageKey;
      }
      chunk.offset += take;
      writeOffset += take;
      if (chunk.offset >= chunk.samples.length) {
        this.chunks.shift();
      }
    }

    if (writeOffset < frames) {
      output.fill(0, writeOffset);
      silent = writeOffset === 0;
    }

    if (activePageKey !== this.activePageKey) {
      this.activePageKey = activePageKey;
    }
    this.port.postMessage({ type: 'played', frames, silent, pageKey: this.activePageKey });
    return true;
  }
}

registerProcessor('stream-player', StreamPlayerProcessor);
