export type VoiceCommandOption = { id: string; label: string };

export function resolveVoiceCommandId(
  name: string | null,
  options: readonly VoiceCommandOption[]
): string | null;
