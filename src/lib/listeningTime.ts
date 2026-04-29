export function formatListeningTime(seconds?: number) {
  if (!seconds) {
    return 'no audio estimate';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return '<1 min';
  }
  return `~${minutes} min`;
}
