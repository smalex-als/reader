// Used by prompt editing, text versions, and chapter generation on both sides.
export const CHAPTER_TEXT_VERSION_MODELS = Object.freeze([
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna'
]);

export function normalizeChapterModel(value) {
  const model = typeof value === 'string' ? value.trim() : '';
  return CHAPTER_TEXT_VERSION_MODELS.includes(model) ? model : 'gpt-5.6-sol';
}
