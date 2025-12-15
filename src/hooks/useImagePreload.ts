import { useEffect, useRef } from 'react';

const DEFAULT_RADIUS = 2;

/**
 * Preload nearby images so page changes feel instant.
 */
export function useImagePreload(manifest: string[], currentPage: number, radius = DEFAULT_RADIUS) {
  const cacheRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const targets = new Set<string>();
    if (manifest.length > 0 && currentPage >= 0) {
      for (let offset = -1; offset <= radius; offset += 1) {
        const index = currentPage + offset;
        if (index >= 0 && index < manifest.length) {
          targets.add(manifest[index]);
        }
      }
    }

    const cache = cacheRef.current;

    Object.keys(cache).forEach((url) => {
      if (!targets.has(url)) {
        cache[url].src = '';
        delete cache[url];
      }
    });

    targets.forEach((url) => {
      if (cache[url]) {
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = url;
      cache[url] = img;
    });
  }, [currentPage, manifest, radius]);

  useEffect(
    () => () => {
      const cache = cacheRef.current;
      Object.keys(cache).forEach((url) => {
        cache[url].src = '';
        delete cache[url];
      });
    },
    []
  );
}
