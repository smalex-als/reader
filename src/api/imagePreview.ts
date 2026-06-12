export interface EnhanceImagePreviewRequest {
  bookId: string;
  imageFilename: string;
  bounds: [number, number, number, number];
  caption: string | null;
}

export async function enhanceImagePreview(input: EnhanceImagePreviewRequest) {
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/image-preview/enhance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: input.imageFilename,
      bounds: input.bounds,
      caption: input.caption
    })
  });
  if (!response.ok) {
    throw new Error(`Enhancement failed (${response.status})`);
  }
  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error('Enhanced image URL is missing');
  }
  return payload.url;
}
