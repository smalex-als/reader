import {
  CHAPTER_TEXT_VERSION_EFFORTS,
  CHAPTER_TEXT_VERSION_MODELS,
  DEFAULT_CHAPTER_TEXT_VERSION_EFFORT,
  type ChapterTextPrompt,
  type ChapterTextPromptDraft,
  type ChapterTextVersionEffort,
  type ChapterTextVersionModel
} from '@/types/app';

type PromptLibraryResponse = {
  prompts?: unknown;
  prompt?: unknown;
};

export interface PromptLibraryResult {
  prompts: ChapterTextPrompt[];
  selectedPromptId?: string;
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePrompt(value: unknown): ChapterTextPrompt | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id : '';
  const name = typeof value.name === 'string' ? value.name : '';
  const template = typeof value.template === 'string' ? value.template : '';
  const model = CHAPTER_TEXT_VERSION_MODELS.includes(value.model as ChapterTextVersionModel)
    ? value.model as ChapterTextVersionModel
    : 'gpt-5.6-sol';
  const reasoningEffort = CHAPTER_TEXT_VERSION_EFFORTS.includes(
    value.reasoningEffort as ChapterTextVersionEffort
  )
    ? (value.reasoningEffort as ChapterTextVersionEffort)
    : DEFAULT_CHAPTER_TEXT_VERSION_EFFORT;
  if (!id || !name || !template) {
    return null;
  }
  return {
    id,
    name,
    template,
    model,
    reasoningEffort,
    builtIn: value.builtIn === true,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null
  };
}

function normalizePromptLibrary(payload: PromptLibraryResponse): PromptLibraryResult {
  const prompts = Array.isArray(payload.prompts)
    ? payload.prompts.map(normalizePrompt).filter((prompt): prompt is ChapterTextPrompt => Boolean(prompt))
    : [];
  const selectedPrompt = normalizePrompt(payload.prompt);
  return {
    prompts,
    selectedPromptId: selectedPrompt?.id
  };
}

async function requestPromptLibrary(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = (await response.json()) as PromptLibraryResponse;
  return normalizePromptLibrary(payload);
}

export function fetchPromptLibrary() {
  return requestPromptLibrary('/api/chapter-text-prompts');
}

export function createPrompt(draft: ChapterTextPromptDraft) {
  return requestPromptLibrary('/api/chapter-text-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft)
  });
}

export function updatePrompt(id: string, draft: ChapterTextPromptDraft) {
  return requestPromptLibrary(`/api/chapter-text-prompts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft)
  });
}

export function deletePrompt(id: string) {
  return requestPromptLibrary(`/api/chapter-text-prompts/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}
