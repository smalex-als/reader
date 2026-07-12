import {
  getStreamPcmResponseKey,
  streamPcmResponseCache
} from '@/lib/streamPcmResponseCache';

export type StreamPcmRequest = {
  text: string;
  voice: string;
  signal?: AbortSignal;
};

async function readStreamError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Streaming request failed (${response.status})`;
  } catch {
    return `Streaming request failed (${response.status})`;
  }
}

function createPcmReader(pcm: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pcm.slice());
      controller.close();
    }
  }).getReader();
}

function createAbortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

async function waitForCachedPcm(pcm: Promise<Uint8Array>, signal?: AbortSignal) {
  if (!signal) {
    return pcm;
  }
  if (signal.aborted) {
    throw createAbortError();
  }
  return Promise.race([
    pcm,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
    })
  ]);
}

export async function openStreamPcmReader({
  text,
  voice,
  signal
}: StreamPcmRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const cacheKey = getStreamPcmResponseKey(text, voice);
  const cachedPcm = streamPcmResponseCache.get(cacheKey);
  if (cachedPcm) {
    return createPcmReader(cachedPcm);
  }
  const pendingPcm = streamPcmResponseCache.getPending(cacheKey);
  if (pendingPcm) {
    return createPcmReader(await waitForCachedPcm(pendingPcm, signal));
  }

  const responsePromise = fetch('/api/stream-audio/pcm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  });
  const pcmPromise = responsePromise.then(async (response) => {
    if (!response.ok) {
      throw new Error(await readStreamError(response.clone()));
    }
    return new Uint8Array(await response.clone().arrayBuffer());
  });
  streamPcmResponseCache.track(cacheKey, pcmPromise).catch(() => {});
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(await readStreamError(response));
  }
  if (!response.body) {
    throw new Error('Streaming response body is unavailable.');
  }
  if (signal?.aborted) {
    await response.body.cancel().catch(() => {});
    throw createAbortError();
  }
  const reader = response.body.getReader();
  signal?.addEventListener('abort', () => {
    void reader.cancel().catch(() => {});
  }, { once: true });
  return reader;
}
