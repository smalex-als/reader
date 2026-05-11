import { createHttpError } from './errors.js';
import { getOpenAI } from './openai.js';
import { loadUnitTopic } from './units.js';

function sanitizeText(value, maxLength = 8000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function extractJsonObject(text) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) {
    return null;
  }
  const fenced = input.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate = fenced?.[1]?.trim() || input;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeStringList(value, maxItems = 5, maxLength = 500) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeEvaluation(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const score = Number.parseInt(raw.score, 10);
  const normalizedScore = Number.isInteger(score) ? Math.min(5, Math.max(0, score)) : null;
  const verdict = sanitizeText(raw.verdict, 80) || 'Needs review';
  const feedback = sanitizeText(raw.feedback, 1600);
  if (normalizedScore === null || !feedback) {
    return null;
  }
  return {
    verdict,
    score: normalizedScore,
    feedback,
    strengths: normalizeStringList(raw.strengths),
    improvements: normalizeStringList(raw.improvements),
    referenceAnswer: sanitizeText(raw.referenceAnswer, 1200)
  };
}

function buildTopicContext(topic) {
  return [
    topic.title ? `Title: ${topic.title}` : '',
    topic.learningGoal ? `Learning goal: ${topic.learningGoal}` : '',
    topic.summary ? `Summary: ${topic.summary}` : '',
    topic.keyPoints?.length > 0 ? `Key points:\n${topic.keyPoints.map((point) => `- ${point}`).join('\n')}` : '',
    topic.content ? `Content:\n${topic.content}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function evaluateUnitTopicSelfCheck({ unitSetId, topicId, question, answer }) {
  const cleanQuestion = sanitizeText(question, 1000);
  const cleanAnswer = sanitizeText(answer, 8000);
  if (!cleanQuestion) {
    throw createHttpError(400, 'Self-check question is required');
  }
  if (!cleanAnswer) {
    throw createHttpError(400, 'Answer is required');
  }

  const topic = await loadUnitTopic({ unitSetId, topicId });
  if (
    topic.selfCheckQuestions.length > 0 &&
    !topic.selfCheckQuestions.some((item) => item.trim() === cleanQuestion)
  ) {
    throw createHttpError(400, 'Question does not belong to this topic');
  }

  const context = buildTopicContext(topic);
  if (!context.trim()) {
    throw createHttpError(400, 'No topic context available');
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: 'gpt-5.5',
    messages: [
      {
        role: 'developer',
        content: [
          {
            type: 'text',
            text: [
              'You evaluate a learner self-check answer against the supplied study topic context.',
              'Use only the supplied context as the source of truth.',
              'Be concise, specific, and useful. Do not invent unsupported facts.',
              'Return only JSON with this shape:',
              '{',
              '  "verdict": "Correct | Partially correct | Needs work",',
              '  "score": 0-5,',
              '  "feedback": "short direct feedback",',
              '  "strengths": ["what the answer got right"],',
              '  "improvements": ["what to add or fix"],',
              '  "referenceAnswer": "compact ideal answer based on the context"',
              '}'
            ].join('\n')
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              topic: {
                id: topic.topicId,
                title: topic.title
              },
              context,
              question: cleanQuestion,
              answer: cleanAnswer
            })
          }
        ]
      }
    ]
  });

  const output = response?.choices?.[0]?.message?.content?.trim() || '';
  const evaluation = normalizeEvaluation(extractJsonObject(output));
  if (!evaluation) {
    throw createHttpError(502, 'Self-check evaluation returned invalid content');
  }
  return {
    question: cleanQuestion,
    answer: cleanAnswer,
    evaluatedAt: new Date().toISOString(),
    evaluation
  };
}
