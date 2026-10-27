import { LOCAL_STREAM_VOICES, XAI_STREAM_VOICES } from '../config.js';
import { getQwenTtsVoices, QWEN_VOICE_PREFIX } from './qwenTts.js';

export const TTS_PROVIDER_XAI = 'xai';
export const TTS_PROVIDER_STREAMING = 'streaming';
export const TTS_PROVIDER_QWEN = 'qwen';

function formatProviderVoiceLabel(voice) {
  return `${voice.charAt(0).toUpperCase()}${voice.slice(1)}`;
}

function formatLocalVoiceLabel(voice) {
  const withoutLocale = voice.slice(3);
  const [name, variant] = withoutLocale.split('_');
  return variant ? `${name} - ${variant}` : name;
}

export function createStreamVoiceOptions() {
  return [
    ...XAI_STREAM_VOICES.map((voice) => ({
      id: `xai_${voice}`,
      label: `${formatProviderVoiceLabel(voice)} - xAI`,
      provider: TTS_PROVIDER_XAI,
      xaiVoice: voice
    })),
    ...LOCAL_STREAM_VOICES.map((id) => ({
      id,
      label: formatLocalVoiceLabel(id),
      provider: TTS_PROVIDER_STREAMING
    }))
  ];
}

async function getQwenVoiceOptions() {
  const { voices } = await getQwenTtsVoices();
  return voices.map((voice) => ({
    id: `${QWEN_VOICE_PREFIX}${voice.id}`,
    label: `${voice.name} - Qwen`,
    provider: TTS_PROVIDER_QWEN
  }));
}

export async function loadStreamVoiceOptions() {
  try {
    return [...createStreamVoiceOptions(), ...await getQwenVoiceOptions()];
  } catch (error) {
    // A local service being offline must not hide the other providers.
    console.warn('Unable to load Qwen TTS voices:', error.message);
    return createStreamVoiceOptions();
  }
}

/**
 * Chapter MP3s are built from one provider's audio, so a `::voice` command can
 * only switch between voices of the provider the chapter is generated with.
 */
export async function getChapterAudioVoiceOptions(provider) {
  if (provider === TTS_PROVIDER_QWEN) return getQwenVoiceOptions();
  const target = provider === 'xai' ? TTS_PROVIDER_XAI : TTS_PROVIDER_STREAMING;
  return createStreamVoiceOptions().filter((option) => option.provider === target);
}
