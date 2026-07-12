const DEFAULT_MAX_ENTRIES = 24;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export function getStreamPcmResponseKey(text: string, voice: string) {
  return `${voice}\u001f${text}`;
}

export class StreamPcmResponseCache {
  private readonly entries = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, Promise<Uint8Array>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private totalBytes = 0;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES, maxBytes = DEFAULT_MAX_BYTES) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  get(key: string) {
    const value = this.entries.get(key);
    if (!value) {
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value.slice();
  }

  getPending(key: string) {
    return this.pending.get(key) ?? null;
  }

  track(key: string, request: Promise<Uint8Array>) {
    const tracked = request.then((value) => {
      this.pending.delete(key);
      this.set(key, value);
      return value;
    }, (error) => {
      this.pending.delete(key);
      throw error;
    });
    this.pending.set(key, tracked);
    return tracked;
  }

  clear() {
    this.entries.clear();
    this.pending.clear();
    this.totalBytes = 0;
  }

  private set(key: string, value: Uint8Array) {
    if (value.byteLength === 0 || value.byteLength > this.maxBytes) {
      return;
    }
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.totalBytes -= existing.byteLength;
    }
    const stored = value.slice();
    this.entries.set(key, stored);
    this.totalBytes += stored.byteLength;
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.totalBytes -= oldest?.byteLength ?? 0;
    }
  }
}

export const streamPcmResponseCache = new StreamPcmResponseCache();
