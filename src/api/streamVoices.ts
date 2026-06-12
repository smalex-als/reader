import type { StreamVoice, StreamVoiceOption } from '@/lib/appConstants';

type StreamVoicesResponse = {
  defaultVoice?: string;
  voices?: StreamVoiceOption[];
};

export async function fetchStreamVoices() {
  const response = await fetch('/api/stream-audio/voices');
  if (!response.ok) {
    throw new Error(`Voice request failed: ${response.status}`);
  }
  const payload = (await response.json()) as StreamVoicesResponse;
  const voices = Array.isArray(payload.voices)
    ? payload.voices.filter(
        (voice) =>
          typeof voice.id === 'string' &&
          voice.id.trim() &&
          typeof voice.label === 'string' &&
          (voice.provider === 'openai' ||
            voice.provider === 'xai' ||
            voice.provider === 'yandex' ||
            voice.provider === 'streaming')
      )
    : [];
  const defaultVoice: StreamVoice =
    typeof payload.defaultVoice === 'string' && voices.some((voice) => voice.id === payload.defaultVoice)
      ? payload.defaultVoice
      : voices[0]?.id ?? '';
  return {
    voices,
    defaultVoice
  };
}
