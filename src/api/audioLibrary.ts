import type { AudioLibraryItem } from '@/types/audioLibrary';

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function fetchAudioLibraryItems() {
  const response = await fetch('/api/audio');
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = (await response.json()) as { items?: AudioLibraryItem[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchSubtitleText(srtUrl: string) {
  const response = await fetch(srtUrl);
  return response.ok ? response.text() : '';
}
