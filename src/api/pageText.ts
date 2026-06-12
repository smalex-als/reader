import { parseOcrLayout } from '@/lib/ocrLayout';
import type { PageText, PageTextOcrEngine } from '@/types/app';

type PageTextResponse = {
  source: 'file' | 'ai';
  text: string;
};

function shapePageText(data: PageTextResponse): PageText {
  const parsed = parseOcrLayout(data.text);
  return {
    text: data.text,
    plainText: parsed.plainText,
    blocks: parsed.blocks,
    source: data.source
  };
}

async function readPageTextResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as PageTextResponse;
  return shapePageText(data);
}

export async function fetchPageTextForImage(input: {
  image: string;
  force?: boolean;
  engine?: PageTextOcrEngine;
}) {
  const params = new URLSearchParams({ image: input.image });
  if (input.force) {
    params.set('skipCache', '1');
  }
  if (input.engine) {
    params.set('engine', input.engine);
  }
  const response = await fetch(`/api/page-text?${params.toString()}`);
  return readPageTextResponse(response);
}

export async function savePageTextForImage(input: {
  image: string;
  text: string;
}) {
  const response = await fetch('/api/page-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: input.image,
      text: input.text
    })
  });
  return readPageTextResponse(response);
}
