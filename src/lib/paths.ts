export function deriveTextUrl(imageUrl: string) {
  return replaceExtension(imageUrl, '.txt');
}

export function deriveAudioUrl(imageUrl: string) {
  return replaceExtension(imageUrl, '.mp3');
}

function replaceExtension(url: string, extension: string) {
  if (!url) return url;
  const lastDot = url.lastIndexOf('.');
  if (lastDot === -1) {
    return `${url}${extension}`;
  }
  return `${url.slice(0, lastDot)}${extension}`;
}
