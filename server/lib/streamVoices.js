import { ELEVENLABS_VOICE_IDS, LOCAL_STREAM_VOICES, XAI_STREAM_VOICES } from '../config.js';
import { ELEVENLABS_VOICE_PREFIX } from './elevenlabsTts.js';
import { getQwenTtsVoices, QWEN_VOICE_PREFIX } from './qwenTts.js';

export const TTS_PROVIDER_XAI = 'xai';
export const TTS_PROVIDER_STREAMING = 'streaming';
export const TTS_PROVIDER_QWEN = 'qwen';
export const TTS_PROVIDER_ELEVENLABS = 'elevenlabs';
const ELEVENLABS_VOICE_NAMES = new Map([
  ['3EuKHIEZbSzrHGNmdYsx', 'Nikolay'],
  ['gJEfHTTiifXEDmO687lC', 'Prince Nur']
]);
let lastQwenVoiceOptions = [];

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
    ...ELEVENLABS_VOICE_IDS.map((id) => ({
      id: `${ELEVENLABS_VOICE_PREFIX}${id}`,
      label: `${ELEVENLABS_VOICE_NAMES.get(id) || id} - ElevenLabs`,
      provider: TTS_PROVIDER_ELEVENLABS
    })),
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
  lastQwenVoiceOptions = voices.map((voice) => ({
    id: `${QWEN_VOICE_PREFIX}${voice.id}`,
    label: `${voice.name} - Qwen`,
    provider: TTS_PROVIDER_QWEN
  }));
  return lastQwenVoiceOptions;
}

export async function loadStreamVoices() {
  try {
    return {
      voices: [...createStreamVoiceOptions(), ...await getQwenVoiceOptions()],
      providerErrors: {}
    };
  } catch (error) {
    // Keep the last live catalog on a transient failure, but report that the
    // service is unavailable instead of silently returning only old providers.
    const message = `Unable to load Qwen voices: ${error.message}. Check QWEN_TTS_SERVER on the Reader server.`;
    console.warn(message);
    return {
      voices: [...createStreamVoiceOptions(), ...lastQwenVoiceOptions],
      providerErrors: { qwen: message }
    };
  }
}

/**
 * Chapter MP3s are built from one provider's audio, so a `::voice` command can
 * only switch between voices of the provider the chapter is generated with.
 */
export async function getChapterAudioVoiceOptions(provider) {
  if (provider === TTS_PROVIDER_QWEN) return getQwenVoiceOptions();
  const target = provider === TTS_PROVIDER_ELEVENLABS ? TTS_PROVIDER_ELEVENLABS
    : provider === 'xai' ? TTS_PROVIDER_XAI : TTS_PROVIDER_STREAMING;
  return createStreamVoiceOptions().filter((option) => option.provider === target);
}
