export type StreamLocator = {
  imageUrl: string;
  blockId: string | null;
};

export function makeStreamLocator(imageUrl: string, blockId: string | null) {
  return blockId ? `${imageUrl}::${blockId}` : imageUrl;
}

export function parseStreamLocator(pageKey: string | null): StreamLocator | null {
  if (!pageKey) {
    return null;
  }
  const separatorIndex = pageKey.indexOf('::');
  if (separatorIndex === -1) {
    return { imageUrl: pageKey, blockId: null };
  }
  const imageUrl = pageKey.slice(0, separatorIndex);
  const remainder = pageKey.slice(separatorIndex + 2);
  const chunkIndex = remainder.indexOf('#chunk-');
  const blockId = (chunkIndex === -1 ? remainder : remainder.slice(0, chunkIndex)) || null;
  return { imageUrl, blockId: blockId === 'page' ? null : blockId };
}
