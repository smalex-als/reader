import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CloseIcon from '@/components/CloseIcon';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import { useToast } from '@/hooks/useToast';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import {
  appActions,
  selectNavigationState,
  selectUnitWorkflow,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { SelfCheckResult, StreamState, UnitItem, UnitSet } from '@/types/app';

interface UnitsViewProps {
  streamState: StreamState;
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSourceLabel(item: UnitSet) {
  const chapter = item.sourceChapterNumber ? `Chapter ${item.sourceChapterNumber}` : null;
  const sourceTitle = item.sourceChapterTitle || chapter;
  if (item.sourceBookId && sourceTitle) {
    return `${item.sourceBookId} · ${sourceTitle}`;
  }
  return item.sourceBookId || sourceTitle || 'Standalone';
}

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }
  if (isValidElement(node)) {
    return extractTextFromNode(node.props.children);
  }
  return '';
}

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

const UNIT_UI_LABELS = {
  selfCheck: 'Self-check',
  selfCheckQuestions: 'Self-check questions',
  question: 'Question',
  of: 'of',
  submitAnswer: 'Submit answer',
  nextQuestion: 'Next question',
  done: 'Done',
  answerPlaceholder: 'Write your answer here',
  checkingAnswer: 'Checking...',
  yourAnswer: 'Your answer',
  referenceAnswer: 'Reference answer',
  strengths: 'Strengths',
  improvements: 'Improve',
  back: 'Back',
  markAsRead: 'Mark as read',
  markAsUnread: 'Mark as unread',
  quiz: 'Quiz',
  playTts: 'Play TTS',
  stopTts: 'Stop TTS'
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

function ReadStatusIcon({ read }: { read: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {read ? (
        <path
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function UnitsView({
  streamState
}: UnitsViewProps) {
  const dispatch = useAppDispatch();
  const { selectedUnitSetId: selectedSetId, selectedUnitTopicId: selectedTopicId } =
    useAppSelector(selectNavigationState);
  const { refreshToken } = useAppSelector(selectUnitWorkflow);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { textFontSize } = settings;
  const { showToast } = useToast();
  const { openQuiz: openUnitTopicQuiz } = useUnitTopicQuiz({
    unitSetId: selectedSetId,
    topicId: selectedTopicId
  });
  const [items, setItems] = useState<UnitSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selfCheckIndex, setSelfCheckIndex] = useState(0);
  const [selfCheckAnswer, setSelfCheckAnswer] = useState('');
  const [selfCheckLoading, setSelfCheckLoading] = useState(false);
  const [selfCheckError, setSelfCheckError] = useState<string | null>(null);
  const [selfCheckResult, setSelfCheckResult] = useState<SelfCheckResult | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const textStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/units');
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as { items?: UnitSet[] };
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load units.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshToken]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) =>
      [
        item.title,
        item.summary,
        item.sourceBookId,
        item.sourceChapterTitle,
        item.sourceVersionId,
        item.source,
        ...item.units.flatMap((unit) => [unit.title, unit.summary, unit.learningGoal])
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [items, query]);

  const selectedSet = useMemo(
    () => items.find((item) => item.id === selectedSetId) ?? null,
    [items, selectedSetId]
  );
  const selectedUnit = useMemo<UnitItem | null>(() => {
    if (!selectedSet) {
      return null;
    }
    return selectedSet.units.find((unit) => unit.id === selectedTopicId) ?? null;
  }, [selectedSet, selectedTopicId]);

  const handleSelectSet = useCallback(
    (unitSetId: string | null) => {
      dispatch(appActions.setSelectedUnitSetId(unitSetId));
      dispatch(appActions.setSelectedUnitTopicId(null));
    },
    [dispatch]
  );

  const handleOpenSet = useCallback(
    (item: UnitSet) => {
      handleSelectSet(item.id);
    },
    [handleSelectSet]
  );

  const handleSelectTopic = useCallback(
    (topicId: string | null) => {
      dispatch(appActions.setSelectedUnitTopicId(topicId));
    },
    [dispatch]
  );

  const handleOpenTopicQuiz = useCallback(
    async (label: string) => {
      dispatch(appActions.setUnitQuizLabel(label));
      await openUnitTopicQuiz();
      dispatch(appActions.refreshUnits());
    },
    [dispatch, openUnitTopicQuiz]
  );

  const replaceUnitSet = useCallback((item: UnitSet) => {
    setItems((current) => current.map((unitSet) => (unitSet.id === item.id ? item : unitSet)));
  }, []);

  const handleToggleTopicRead = useCallback(
    async (unitSetId: string, topicId: string, read: boolean) => {
      try {
        const response = await fetch(
          `/api/units/${encodeURIComponent(unitSetId)}/topics/${encodeURIComponent(topicId)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ read })
          }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as { item?: UnitSet };
        if (payload.item) {
          replaceUnitSet(payload.item);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to update topic.';
        showToast(message, 'error');
      }
    },
    [replaceUnitSet, showToast]
  );

  useEffect(() => {
    if (!selectedTopicId) {
      return;
    }
    detailRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setSelfCheckOpen(false);
    setSelfCheckIndex(0);
    setSelfCheckAnswer('');
    setSelfCheckError(null);
    setSelfCheckResult(null);
  }, [selectedTopicId]);

  if (selectedSet && selectedUnit) {
    const selectedUnitIndex = selectedSet.units.findIndex((unit) => unit.id === selectedUnit.id);
    const selectedUnitNumber = selectedUnitIndex >= 0 ? selectedUnitIndex + 1 : selectedUnit.order;
    const unitStreamBaseKey = `unit::${encodeURIComponent(selectedSet.id)}::${encodeURIComponent(selectedUnit.id)}`;
    const unitParagraphPrefix = `${unitStreamBaseKey}::paragraph-start-`;
    const topicStreamActive =
      typeof streamState.pageKey === 'string' &&
      streamState.pageKey.startsWith(unitParagraphPrefix) &&
      (streamState.status === 'connecting' ||
        streamState.status === 'streaming' ||
        streamState.status === 'paused');
    const labels = UNIT_UI_LABELS;
    const contentLabels = getContentLabels(selectedUnit);
    const topicText = [
      selectedUnit.learningGoal ? `**${contentLabels.learningGoal}:** ${selectedUnit.learningGoal}` : '',
      selectedUnit.summary ? `**${contentLabels.summary}:** ${selectedUnit.summary}` : '',
      selectedUnit.keyPoints.length > 0
        ? `**${contentLabels.keyPoints}:**\n${selectedUnit.keyPoints.map((point) => `- ${point}`).join('\n')}`
        : '',
      selectedUnit.content,
      selectedUnit.selfCheckQuestions.length > 0
        ? `**${contentLabels.selfCheckQuestions}:**\n${selectedUnit.selfCheckQuestions
            .map((question) => `- ${question}`)
            .join('\n')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n');
    const topicSpeechText = [selectedUnit.title, topicText].filter(Boolean).join('\n\n');
    const selfCheckQuestions = selectedUnit.selfCheckQuestions;
    const currentSelfCheckQuestion = selfCheckQuestions[selfCheckIndex] ?? null;
    const closeSelfCheck = () => {
      if (selfCheckLoading) {
        return;
      }
      setSelfCheckOpen(false);
    };
    const selectSelfCheckQuestion = (index: number) => {
      setSelfCheckIndex(index);
      setSelfCheckAnswer('');
      setSelfCheckError(null);
      setSelfCheckResult(null);
    };
    const goToNextSelfCheckQuestion = () => {
      if (selfCheckIndex >= selfCheckQuestions.length - 1) {
        closeSelfCheck();
        return;
      }
      selectSelfCheckQuestion(selfCheckIndex + 1);
    };
    const submitSelfCheckAnswer = async () => {
      if (!selectedSet || !selectedUnit || !currentSelfCheckQuestion || !selfCheckAnswer.trim()) {
        return;
      }
      setSelfCheckLoading(true);
      setSelfCheckError(null);
      try {
        const response = await fetch(
          `/api/units/${encodeURIComponent(selectedSet.id)}/topics/${encodeURIComponent(selectedUnit.id)}/self-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              question: currentSelfCheckQuestion,
              answer: selfCheckAnswer
            })
          }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        setSelfCheckResult((await response.json()) as SelfCheckResult);
      } catch (error) {
        setSelfCheckError(error instanceof Error ? error.message : 'Unable to check answer.');
      } finally {
        setSelfCheckLoading(false);
      }
    };
    const activeParagraphStart = (() => {
      if (!topicStreamActive || typeof streamState.pageKey !== 'string') {
        return null;
      }
      if (!streamState.pageKey.startsWith(unitParagraphPrefix)) {
        return null;
      }
      return Number.parseInt(streamState.pageKey.slice(unitParagraphPrefix.length), 10);
    })();
    const shouldIgnoreBlockClick = (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return false;
      }
      if (target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]')) {
        return true;
      }
      return Boolean(window.getSelection()?.toString().trim());
    };
    const resolveTextRange = (textValue: string, node?: any) => {
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const start = Math.max(0, topicText.lastIndexOf('\n', nodeOffset - 1) + 1);
        const nodeEnd = node?.position?.end?.offset;
        const end = typeof nodeEnd === 'number' && nodeEnd > start ? nodeEnd : start + textValue.length;
        return { start, end };
      }
      if (textValue) {
        const foundIndex = topicText.indexOf(textValue);
        if (foundIndex !== -1) {
          const start = Math.max(0, topicText.lastIndexOf('\n', foundIndex - 1) + 1);
          return { start, end: foundIndex + textValue.length };
        }
      }
      return { start: 0, end: 0 };
    };
    const isPlayingRange = (startIndex: number, endIndex: number) => {
      return (
        activeParagraphStart !== null &&
        activeParagraphStart >= startIndex &&
        activeParagraphStart < Math.max(endIndex, startIndex + 1)
      );
    };
    const playTextBlock = (textValue: string, startIndex: number) => {
      dispatch(appActions.requestStudyAudioUnitTopicParagraph({
        fullText: topicText,
        startIndex,
        key: unitStreamBaseKey
      }));
    };
    const markdownComponents = {
      p: ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        return (
          <p
            className="text-viewer-block"
            data-playing={isPlayingRange(startIndex, endIndex) ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event: ReactMouseEvent<HTMLParagraphElement>) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(textValue, startIndex);
            }}
          >
            {children}
          </p>
        );
      },
      ul: ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        return (
          <div
            className="text-viewer-block text-viewer-list-block"
            data-playing={isPlayingRange(startIndex, endIndex) ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(textValue, startIndex);
            }}
          >
            <ul {...props}>{children}</ul>
          </div>
        );
      },
      ol: ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        return (
          <div
            className="text-viewer-block text-viewer-list-block"
            data-playing={isPlayingRange(startIndex, endIndex) ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(textValue, startIndex);
            }}
          >
            <ol {...props}>{children}</ol>
          </div>
        );
      }
    };
    return (
      <div ref={detailRef} className="audio-library unit-library unit-library-detail">
        <header className="audio-library-detail-header">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => handleSelectTopic(null)}
          >
            {labels.back}
          </button>
          <div className="audio-viewer-title">
            <span className="audio-viewer-label">{selectedSet.title}</span>
            <h2 className="audio-viewer-heading">{selectedUnitNumber} - {selectedUnit.title}</h2>
          </div>
          <div className="audio-library-detail-actions">
            <button
              type="button"
              className={`unit-library-read-button ${selectedUnit.read ? 'unit-library-read-button-active' : ''}`}
              aria-pressed={selectedUnit.read}
              onClick={() => void handleToggleTopicRead(selectedSet.id, selectedUnit.id, !selectedUnit.read)}
            >
              <ReadStatusIcon read={selectedUnit.read} />
              <span>{selectedUnit.read ? labels.markAsUnread : labels.markAsRead}</span>
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setSelfCheckOpen(true);
                setSelfCheckIndex(0);
                setSelfCheckAnswer('');
                setSelfCheckError(null);
                setSelfCheckResult(null);
              }}
              disabled={selfCheckQuestions.length === 0}
            >
              {labels.selfCheck}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                void handleOpenTopicQuiz(`${selectedUnitNumber} - ${selectedUnit.title}`)
              }
            >
              {labels.quiz}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                if (topicStreamActive) {
                  dispatch(appActions.requestStudyAudioStop());
                  return;
                }
                dispatch(appActions.requestStudyAudioUnitTopicParagraph({
                  fullText: topicSpeechText,
                  startIndex: 0,
                  key: unitStreamBaseKey
                }));
              }}
              disabled={!topicStreamActive && !topicSpeechText.trim()}
            >
              {topicStreamActive ? labels.stopTts : labels.playTts}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-expanded={settingsOpen}
              aria-controls="unit-library-text-settings"
            >
              {settingsOpen ? 'Hide settings' : 'Text settings'}
            </button>
          </div>
          {settingsOpen ? (
            <TextSettingsPanel
              id="unit-library-text-settings"
              className="unit-library-settings"
              controlPrefix="unit"
            />
          ) : null}
        </header>

        <article className="unit-library-unit-panel">
          <div className="text-viewer-markdown unit-library-markdown" style={textStyle}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {topicText}
            </ReactMarkdown>
          </div>
        </article>
        {selfCheckOpen ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal modal-quiz modal-self-check">
              <header className="modal-header">
                <h2 className="modal-title">
                  {labels.selfCheck}
                  <span className="modal-marker">• {selectedUnit.title}</span>
                </h2>
                <button
                  type="button"
                  className="button button-ghost modal-icon-button"
                  onClick={closeSelfCheck}
                  disabled={selfCheckLoading}
                  aria-label="Close self-check"
                  title="Close self-check"
                >
                  <CloseIcon />
                </button>
              </header>
              <section className="modal-body">
                {currentSelfCheckQuestion ? (
                  <div className="quiz-modal-content self-check-modal-content">
                    <div className="quiz-modal-header">
                      <div>
                        <h3 className="quiz-modal-title">{currentSelfCheckQuestion}</h3>
                        <p className="quiz-modal-progress">
                          {labels.question} {selfCheckIndex + 1} {labels.of} {selfCheckQuestions.length}
                        </p>
                      </div>
                    </div>
                    <div className="self-check-question-picker" aria-label={labels.selfCheckQuestions}>
                      {selfCheckQuestions.map((question, index) => (
                        <button
                          key={`${question}-${index}`}
                          type="button"
                          className={`self-check-question-chip ${
                            index === selfCheckIndex ? 'self-check-question-chip-active' : ''
                          }`}
                          onClick={() => selectSelfCheckQuestion(index)}
                          disabled={selfCheckLoading}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                    <label className="self-check-answer-field">
                      <span>{labels.yourAnswer}</span>
                      <textarea
                        value={selfCheckAnswer}
                        placeholder={labels.answerPlaceholder}
                        disabled={selfCheckLoading}
                        onChange={(event) => {
                          setSelfCheckAnswer(event.currentTarget.value);
                          setSelfCheckResult(null);
                          setSelfCheckError(null);
                        }}
                      />
                    </label>
                    {selfCheckError ? <p className="modal-status">{selfCheckError}</p> : null}
                    {selfCheckResult ? (
                      <div className="self-check-result">
                        <div className="self-check-score">
                          <strong>{selfCheckResult.evaluation.verdict}</strong>
                          <span>{selfCheckResult.evaluation.score}/5</span>
                        </div>
                        <p>{selfCheckResult.evaluation.feedback}</p>
                        {selfCheckResult.evaluation.strengths.length > 0 ? (
                          <div>
                            <h4>{labels.strengths}</h4>
                            <ul>
                              {selfCheckResult.evaluation.strengths.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {selfCheckResult.evaluation.improvements.length > 0 ? (
                          <div>
                            <h4>{labels.improvements}</h4>
                            <ul>
                              {selfCheckResult.evaluation.improvements.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {selfCheckResult.evaluation.referenceAnswer ? (
                          <div>
                            <h4>{labels.referenceAnswer}</h4>
                            <p>{selfCheckResult.evaluation.referenceAnswer}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <footer className="quiz-modal-footer">
                      <button type="button" className="button button-secondary" onClick={closeSelfCheck}>
                        {labels.back}
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => {
                          if (selfCheckResult) {
                            goToNextSelfCheckQuestion();
                            return;
                          }
                          void submitSelfCheckAnswer();
                        }}
                        disabled={selfCheckLoading || (!selfCheckResult && !selfCheckAnswer.trim())}
                      >
                        {selfCheckLoading
                          ? labels.checkingAnswer
                          : selfCheckResult
                          ? selfCheckIndex >= selfCheckQuestions.length - 1
                            ? labels.done
                            : labels.nextQuestion
                          : labels.submitAnswer}
                      </button>
                    </footer>
                  </div>
                ) : (
                  <p className="modal-status">No self-check questions available.</p>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (selectedSet) {
    const sourceLabel = getSourceLabel(selectedSet);
    return (
      <div className="audio-library unit-library unit-library-detail">
        <header className="audio-library-detail-header">
          <button type="button" className="button button-secondary" onClick={() => handleSelectSet(null)}>
            Back
          </button>
          <div className="audio-viewer-title">
            <span className="audio-viewer-label">Units</span>
            <h2 className="audio-viewer-heading">{selectedSet.title}</h2>
          </div>
          <div className="audio-library-detail-actions">
            {selectedSet.sourceBookId && selectedSet.sourceChapterNumber ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  dispatch(
                    appActions.requestUnitSourceNavigation(
                      selectedSet.sourceBookId!,
                      selectedSet.sourceChapterNumber!
                    )
                  )
                }
              >
                Open Source
              </button>
            ) : null}
          </div>
        </header>

        <section className="audio-library-player-panel">
          <div className="audio-library-meta audio-library-detail-meta">
            <span>{sourceLabel}</span>
            <span>{selectedSet.units.length} topics</span>
            <span>{selectedSet.source}</span>
            {selectedSet.sourceVersionId ? <span>{selectedSet.sourceVersionId}</span> : null}
            {formatDate(selectedSet.createdAt) ? <span>{formatDate(selectedSet.createdAt)}</span> : null}
          </div>
          {selectedSet.summary ? <p className="unit-library-summary">{selectedSet.summary}</p> : null}
        </section>

        <section className="unit-library-topics" aria-label="Unit topics">
          {selectedSet.units.map((unit, index) => (
            <article
              key={unit.id}
              className={`unit-library-topic-card ${unit.read ? 'unit-library-topic-card-read' : ''}`}
            >
              <div className="unit-library-topic-title-row">
                <button
                  type="button"
                  className="unit-library-topic-title"
                  onClick={() => handleSelectTopic(unit.id)}
                >
                  {index + 1} - {unit.title}
                </button>
                {unit.hasQuiz ? <span className="unit-library-topic-badge">Quiz</span> : null}
              </div>
              <button
                type="button"
                className={`unit-library-read-button ${unit.read ? 'unit-library-read-button-active' : ''}`}
                aria-pressed={unit.read}
                onClick={() => void handleToggleTopicRead(selectedSet.id, unit.id, !unit.read)}
              >
                <ReadStatusIcon read={unit.read} />
                <span>{unit.read ? 'Mark as unread' : 'Mark as read'}</span>
              </button>
            </article>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="audio-library unit-library">
      <header className="audio-library-header">
        <div className="audio-viewer-title">
          <span className="audio-viewer-label">Units</span>
          <h2 className="audio-viewer-heading">Standalone unit sets</h2>
        </div>
        <div className="audio-library-controls">
          <label className="toolbar-field audio-library-search">
            Search
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, source, keyword"
            />
          </label>
          <button type="button" className="button" onClick={() => void loadItems()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="audio-library-body">
        {loading && items.length === 0 ? <p className="audio-viewer-status">Loading units...</p> : null}
        {!loading && items.length === 0 ? <p className="audio-viewer-status">No units created yet.</p> : null}
        {items.length > 0 && filteredItems.length === 0 ? (
          <p className="audio-viewer-status">No units match this search.</p>
        ) : null}

        <div className="audio-library-list">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="audio-library-row"
              role="button"
              tabIndex={0}
              onClick={() => handleOpenSet(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleOpenSet(item);
                }
              }}
            >
              <div className="audio-library-main">
                <div className="audio-library-title-row">
                  <span className="audio-library-book">{getSourceLabel(item)}</span>
                  <span className="audio-library-chapter">{item.units.length} units</span>
                </div>
                <h3 className="audio-library-title">{item.title}</h3>
                {item.summary ? <p className="unit-library-row-summary">{item.summary}</p> : null}
                <div className="audio-library-meta">
                  <span>{item.source}</span>
                  {item.sourceVersionId ? <span>{item.sourceVersionId}</span> : null}
                  {formatDate(item.createdAt) ? <span>{formatDate(item.createdAt)}</span> : null}
                </div>
              </div>
              <div className="audio-library-actions">
                <button
                  type="button"
                  className="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenSet(item);
                  }}
                >
                  Open
                </button>
                {item.sourceBookId && item.sourceChapterNumber ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatch(
                        appActions.requestUnitSourceNavigation(
                          item.sourceBookId!,
                          item.sourceChapterNumber!
                        )
                      );
                    }}
                  >
                    Source
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
