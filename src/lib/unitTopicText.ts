import type { UnitItem } from '@/types/app';

const CONTENT_LABELS_EN = {
  learningGoal: 'Learning goal',
  summary: 'Summary',
  keyPoints: 'Key points',
  selfCheckQuestions: 'Self-check questions'
};

const CONTENT_LABELS_RU = {
  learningGoal: 'Цель',
  summary: 'Краткое содержание',
  keyPoints: 'Главное',
  selfCheckQuestions: 'Вопросы для самопроверки'
};

function isMostlyRussianText(value: string) {
  const cyrillicMatches = value.match(/[А-Яа-яЁё]/g)?.length ?? 0;
  if (cyrillicMatches === 0) {
    return false;
  }
  const latinMatches = value.match(/[A-Za-z]/g)?.length ?? 0;
  return cyrillicMatches >= latinMatches;
}

function getContentLabels(unit: UnitItem) {
  const text = [
    unit.title,
    unit.summary,
    unit.learningGoal,
    unit.content,
    ...unit.keyPoints,
    ...unit.selfCheckQuestions
  ].join('\n');
  return isMostlyRussianText(text) ? CONTENT_LABELS_RU : CONTENT_LABELS_EN;
}

export function getUnitTopicText(unit: UnitItem) {
  const contentLabels = getContentLabels(unit);
  const topicText = [
    unit.learningGoal ? `**${contentLabels.learningGoal}:** ${unit.learningGoal}` : '',
    unit.summary ? `**${contentLabels.summary}:** ${unit.summary}` : '',
    unit.keyPoints.length > 0
      ? `**${contentLabels.keyPoints}:**\n${unit.keyPoints.map((point) => `- ${point}`).join('\n')}`
      : '',
    unit.content,
    unit.selfCheckQuestions.length > 0
      ? `**${contentLabels.selfCheckQuestions}:**\n${unit.selfCheckQuestions
          .map((question) => `- ${question}`)
          .join('\n')}`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    topicText,
    topicSpeechText: [unit.title, topicText].filter(Boolean).join('\n\n')
  };
}
