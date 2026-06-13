import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import CloseIcon from '@/components/CloseIcon';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import UnitTopicMarkdown from '@/components/UnitTopicMarkdown';
import { useUnitSelfCheckRuntime } from '@/hooks/useUnitSelfCheckRuntime';
import { useUnitTopicPlayback } from '@/hooks/useUnitTopicPlayback';
import { useUnitsNavigationActions } from '@/hooks/useUnitsNavigationActions';
import { useUnitsViewActions } from '@/hooks/useUnitsViewActions';
import {
  selectUnitWorkflow,
  selectViewerWorkflow,
  useAppSelector
} from '@/state/appState';
import type { UnitItem, UnitSet } from '@/types/app';
import { getUnitTopicText } from '@/lib/unitTopicText';

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

export default function UnitsView() {
  const {
    selectedSetId,
    selectedTopicId,
    selectSet,
    openSet,
    selectTopic,
    openTopicQuiz,
    openSource
  } = useUnitsNavigationActions();
  const { refreshToken } = useAppSelector(selectUnitWorkflow);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { textFontSize } = settings;
  const {
    items,
    loading,
    selfCheckLoading,
    selfCheckError,
    selfCheckResult,
    clearSelfCheckFeedback,
    loadItems,
    toggleTopicRead,
    evaluateSelfCheck
  } = useUnitsViewActions();
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );

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
  const { topicText, topicSpeechText } = useMemo(
    () => (selectedUnit ? getUnitTopicText(selectedUnit) : { topicText: '', topicSpeechText: '' }),
    [selectedUnit]
  );
  const {
    activeParagraphStart,
    topicStreamActive,
    playTextBlock,
    toggleTopicSpeech
  } = useUnitTopicPlayback({
    unitSetId: selectedSet?.id ?? '',
    topicId: selectedUnit?.id ?? '',
    topicText,
    topicSpeechText
  });
  const {
    currentSelfCheckQuestion,
    detailRef,
    selfCheckAnswer,
    selfCheckIndex,
    selfCheckOpen,
    selfCheckQuestions,
    closeSelfCheck,
    goToNextSelfCheckQuestion,
    openSelfCheck,
    selectSelfCheckQuestion,
    submitSelfCheckAnswer,
    updateSelfCheckAnswer
  } = useUnitSelfCheckRuntime({
    clearSelfCheckFeedback,
    evaluateSelfCheck,
    selectedSet,
    selectedTopicId,
    selectedUnit,
    selfCheckLoading
  });

  const handleToggleTopicRead = useCallback(
    async (unitSetId: string, topicId: string, read: boolean) => {
      await toggleTopicRead({ unitSetId, topicId, read });
    },
    [toggleTopicRead]
  );

  if (selectedSet && selectedUnit) {
    const selectedUnitIndex = selectedSet.units.findIndex((unit) => unit.id === selectedUnit.id);
    const selectedUnitNumber = selectedUnitIndex >= 0 ? selectedUnitIndex + 1 : selectedUnit.order;
    const labels = UNIT_UI_LABELS;
    return (
      <div ref={detailRef} className="audio-library unit-library unit-library-detail">
        <header className="audio-library-detail-header">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => selectTopic(null)}
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
              onClick={openSelfCheck}
              disabled={selfCheckQuestions.length === 0}
            >
              {labels.selfCheck}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                void openTopicQuiz(`${selectedUnitNumber} - ${selectedUnit.title}`)
              }
            >
              {labels.quiz}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={toggleTopicSpeech}
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
            <UnitTopicMarkdown
              activeParagraphStart={activeParagraphStart}
              playTextBlock={playTextBlock}
              text={topicText}
            />
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
                        onChange={(event) => updateSelfCheckAnswer(event.currentTarget.value)}
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
          <button type="button" className="button button-secondary" onClick={() => selectSet(null)}>
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
                  openSource(selectedSet.sourceBookId!, selectedSet.sourceChapterNumber!)
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
                  onClick={() => selectTopic(unit.id)}
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
              onClick={() => openSet(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openSet(item);
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
                    openSet(item);
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
                      openSource(item.sourceBookId!, item.sourceChapterNumber!);
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
