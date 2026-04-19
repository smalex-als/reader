export function deriveTextUrl(imageUrl: string) {
  return replaceExtension(imageUrl, '.txt');
}

export function deriveAudioUrl(imageUrl: string, provider: 'openai' | 'xai' = 'openai') {
  return replaceExtension(imageUrl, provider === 'xai' ? '.xai.mp3' : '.mp3');
}

function replaceExtension(url: string, extension: string) {
  if (!url) return url;
  const lastDot = url.lastIndexOf('.');
  if (lastDot === -1) {
    return `${url}${extension}`;
  }
  return `${url.slice(0, lastDot)}${extension}`;
}
