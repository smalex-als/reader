export function normalizeImageCaption(caption: string | null | undefined) {
  const input = typeof caption === 'string' ? caption : '';
  const stripped = input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || null;
}

export function makeImagePreviewKey(
  bookId: string,
  imageFilename: string,
  bounds: [number, number, number, number]
) {
  const [left, top, right, bottom] = bounds;
  return `${bookId}:${imageFilename}:${left}:${top}:${right}:${bottom}`;
}
