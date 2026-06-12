import type { SelfCheckResult, UnitSet } from '@/types/app';

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function fetchUnitSets() {
  const response = await fetch('/api/units');
  const payload = await readJson<{ items?: UnitSet[] }>(response);
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function createUnitSetFromChapter(input: {
  sourceBookId: string;
  sourceChapterNumber: number;
  sourceChapterTitle: string | null;
  sourceVersionId: string | null;
  content: string;
}) {
  const response = await fetch('/api/units', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });
  return readJson<{ item: UnitSet }>(response);
}

export async function updateUnitTopicRead(input: {
  unitSetId: string;
  topicId: string;
  read: boolean;
}) {
  const response = await fetch(
    `/api/units/${encodeURIComponent(input.unitSetId)}/topics/${encodeURIComponent(input.topicId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ read: input.read })
    }
  );
  const payload = await readJson<{ item?: UnitSet }>(response);
  return payload.item ?? null;
}

export async function evaluateUnitTopicSelfCheck(input: {
  unitSetId: string;
  topicId: string;
  question: string;
  answer: string;
}) {
  const response = await fetch(
    `/api/units/${encodeURIComponent(input.unitSetId)}/topics/${encodeURIComponent(input.topicId)}/self-check`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        question: input.question,
        answer: input.answer
      })
    }
  );
  return readJson<SelfCheckResult>(response);
}
