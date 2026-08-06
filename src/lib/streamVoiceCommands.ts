import type { StreamVoiceOption } from '@/lib/appConstants';

/**
 * Voice ids look like `en-Mike_man`, so authors get to write `::voice mike`
 * instead of repeating the full id.
 */
function extractVoiceNamePart(id: string) {
  return id
    .replace(/^[a-z]{2}(?:-[A-Z]{2})?-/i, '')
    .split('_')[0]
    .toLowerCase();
}

export function resolveVoiceCommandId(
  name: string | null,
  options: readonly StreamVoiceOption[]
): string | null {
  const target = typeof name === 'string' ? name.trim() : '';
  if (!target) {
    return null;
  }
  if (options.length === 0) {
    return target;
  }
  const lowered = target.toLowerCase();
  const match =
    options.find((option) => option.id === target) ??
    options.find((option) => option.id.toLowerCase() === lowered) ??
    options.find((option) => option.label.toLowerCase() === lowered) ??
    options.find((option) => extractVoiceNamePart(option.id) === lowered);
  return match?.id ?? null;
}
