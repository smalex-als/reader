import type { Quiz } from '@/types/app';

export type QuizTarget =
  | {
      kind: 'chapter';
      bookId: string;
      chapterNumber: number;
      pageRange?: {
        start: number;
        end: number;
      } | null;
    }
  | {
      kind: 'unitTopic';
      unitSetId: string;
      topicId: string;
    };

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Quiz request failed: ${response.status}`;
  } catch {
    return `Quiz request failed: ${response.status}`;
  }
}

function getQuizUrl(target: QuizTarget) {
  if (target.kind === 'chapter') {
    return `/api/books/${encodeURIComponent(target.bookId)}/chapters/${target.chapterNumber}/quiz`;
  }
  return `/api/units/${encodeURIComponent(target.unitSetId)}/topics/${encodeURIComponent(target.topicId)}/quiz`;
}

function getQuizPostBody(target: QuizTarget, force: boolean) {
  if (target.kind === 'chapter') {
    return {
      force,
      ...(target.pageRange
        ? {
            pageStart: target.pageRange.start,
            pageEnd: target.pageRange.end
          }
        : {})
    };
  }
  return { force };
}

export async function loadQuizTarget(target: QuizTarget, force = false) {
  const url = getQuizUrl(target);
  let response = await fetch(url);
  if (response.status === 404 || force) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getQuizPostBody(target, force))
    });
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as Omit<Quiz, 'contextKey'> & { contextKey?: string };
  return {
    ...payload,
    questions: Array.isArray(payload.questions) ? payload.questions : []
  };
}
