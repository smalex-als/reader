export { resolveVoiceCommandId } from '../../shared/voiceCommandsCore.js';

/**
 * Voice labels read like `Emma - woman`, but the badge only has room for who is
 * speaking, so it keeps the leading name.
 */
export function formatVoiceBadgeLabel(value: string) {
  const firstWord = value.trim().split(/\s+/)[0] ?? '';
  return firstWord.replace(/[-–—,:;]+$/, '') || value.trim();
}
