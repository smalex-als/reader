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

export async function openStreamPcmReader({
  text,
  voice,
  signal
}: StreamPcmRequest): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await fetch('/api/stream-audio/pcm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
    signal
  });

  if (!response.ok) {
    throw new Error(await readStreamError(response));
  }
  if (!response.body) {
    throw new Error('Streaming response body is unavailable.');
  }

  return response.body.getReader();
}
