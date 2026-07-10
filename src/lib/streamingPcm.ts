export type QueuedStreamItem = {
  text: string;
  pageKey: string;
  voice: string;
  pauseAfterMs: number;
};

export type CachedStreamChunk = {
  samples: Float32Array;
  pageKey: string | null;
};

export class Pcm16Decoder {
  private remainder: Uint8Array | null = null;

  decode(chunk: Uint8Array): Float32Array | null {
    const combined = this.remainder
      ? (() => {
          const next = new Uint8Array(this.remainder.byteLength + chunk.byteLength);
          next.set(this.remainder, 0);
          next.set(chunk, this.remainder.byteLength);
          this.remainder = null;
          return next;
        })()
      : chunk;
    const evenByteLength = combined.byteLength - (combined.byteLength % 2);
    if (evenByteLength <= 0) {
      this.remainder = combined.slice();
      return null;
    }
    if (evenByteLength < combined.byteLength) {
      this.remainder = combined.slice(evenByteLength);
    }
    const sampleCount = evenByteLength / 2;
    const view = new DataView(combined.buffer, combined.byteOffset, evenByteLength);
    const samples = new Float32Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = view.getInt16(index * 2, true) / 32768;
    }
    return samples;
  }

  reset() {
    this.remainder = null;
  }
}

export class StreamPcmCache {
  private readonly entries = new Map<string, CachedStreamChunk[]>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get(key: string) {
    const chunks = this.entries.get(key);
    if (!chunks) {
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, chunks);
    return chunks.map((chunk) => ({
      pageKey: chunk.pageKey,
      samples: chunk.samples.slice()
    }));
  }

  set(key: string, chunks: CachedStreamChunk[]) {
    if (chunks.length === 0 || this.limit <= 0) {
      return;
    }
    this.entries.delete(key);
    this.entries.set(
      key,
      chunks.map((chunk) => ({
        pageKey: chunk.pageKey,
        samples: chunk.samples.slice()
      }))
    );
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }

  has(key: string) {
    return this.entries.has(key);
  }

  get size() {
    return this.entries.size;
  }
}

export class StreamAudioQueue {
  private items: QueuedStreamItem[] = [];

  enqueue(item: QueuedStreamItem) {
    this.items.push(item);
  }

  dequeue() {
    return this.items.shift() ?? null;
  }

  clear() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }
}

export function createSilenceChunk(durationMs: number, sampleRate: number) {
  if (durationMs <= 0) {
    return null;
  }
  const sampleCount = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  return new Float32Array(sampleCount);
}

export function getStreamPcmCacheKey(text: string, pageKey: string, voice: string) {
  return `${voice}\u001f${pageKey}\u001f${text}`;
}
