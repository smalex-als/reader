import { useEffect, useMemo, useRef, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import { useChapterQuiz } from '@/hooks/useChapterQuiz';
import { useCurrentChapterLabel } from '@/hooks/useCurrentChapterLabel';
import { useReaderCommands } from '@/hooks/useReaderCommands';
import { useUnitActions } from '@/hooks/useUnitActions';
import { useUnitTopicQuiz } from '@/hooks/useUnitTopicQuiz';
import {
  appActions,
  selectModalOpen,
  selectQuizWorkflow,
  selectReaderPreferences,
  selectStreamRuntime,
  selectUnitWorkflow,
  useAppDispatch,
  useAppSelector,
  type QuizModal as QuizModalId
} from '@/state/appState';

export default function QuizModal() {
  const dispatch = useAppDispatch();
  const {
    stopStudyAudio,
    playStudyAudioSingle
  } = useReaderCommands();
  const { regenerateQuiz: regenerateChapterQuiz } = useChapterQuiz();
  const { refreshUnits } = useUnitActions();
  const { regenerateQuiz: regenerateUnitTopicQuiz } = useUnitTopicQuiz();
  const unitQuizOpen = useAppSelector(selectModalOpen('unitQuiz'));
  const chapterQuizOpen = useAppSelector(selectModalOpen('chapterQuiz'));
  const activeModal: QuizModalId = unitQuizOpen ? 'unitQuiz' : 'chapterQuiz';
  const open = unitQuizOpen || chapterQuizOpen;
  const { loading, error, quiz } = useAppSelector(selectQuizWorkflow(activeModal));
  const { quizAutoPlayEnabled: autoPlayEnabled } = useAppSelector(selectReaderPreferences);
  const streamState = useAppSelector(selectStreamRuntime);
  const { quizLabel: unitQuizLabel } = useAppSelector(selectUnitWorkflow);
  const chapterLabel = useCurrentChapterLabel();
  const modalContextLabel = activeModal === 'unitQuiz' ? unitQuizLabel : chapterLabel;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const wasOpenRef = useRef(false);
  const autoPlayQuestionKeyRef = useRef<string | null>(null);
  const handleClose = () => {
    stopStudyAudio();
    dispatch(appActions.closeModal(activeModal));
  };
  const handleRegenerateQuiz = () => {
    if (activeModal === 'unitQuiz') {
      void regenerateUnitTopicQuiz().then(refreshUnits);
      return;
    }
    void regenerateChapterQuiz();
  };

  useEffect(() => {
    if (!open) {
      autoPlayQuestionKeyRef.current = null;
      return;
    }
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
  }, [open, quiz?.contextKey, quiz?.title]);

  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[currentIndex] ?? null;
  const currentAnswer =
    currentQuestion && Number.isInteger(answers[currentQuestion.id]) ? answers[currentQuestion.id] : null;
  const currentQuestionAnswered = currentAnswer !== null;
  const currentQuestionStreamPrefix =
    quiz && currentQuestion ? `${quiz.contextKey}::question-${currentIndex + 1}` : null;
  const isCurrentQuestionStreaming =
    !!currentQuestionStreamPrefix &&
    (streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused') &&
    typeof streamState.pageKey === 'string' &&
    streamState.pageKey.startsWith(currentQuestionStreamPrefix);
  const answeredCount = useMemo(
    () => questions.filter((question) => Number.isInteger(answers[question.id])).length,
    [answers, questions]
  );
  const score = useMemo(() => {
    if (!submitted) {
      return null;
    }
    return questions.reduce((total, question) => {
      return total + (answers[question.id] === question.correctIndex ? 1 : 0);
    }, 0);
  }, [answers, questions, submitted]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) {
      autoPlayQuestionKeyRef.current = null;
      return;
    }
    if (!quiz || !currentQuestion) {
      return;
    }
    const questionKey = `${quiz.contextKey}:${currentQuestion.id}:${currentIndex}`;
    if (justOpened) {
      autoPlayQuestionKeyRef.current = null;
    }
    if (!autoPlayEnabled || currentQuestionAnswered) {
      return;
    }
    if (autoPlayQuestionKeyRef.current === questionKey) {
      return;
    }
    autoPlayQuestionKeyRef.current = questionKey;
    const spokenText = [
      `Question ${currentIndex + 1}. ${currentQuestion.prompt}`,
      'Answer choices.',
      ...currentQuestion.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`)
    ].join('\n\n');
    playStudyAudioSingle({
      text: spokenText,
      pageKey: `${quiz.contextKey}::question-${currentIndex + 1}`
    });
  }, [autoPlayEnabled, currentIndex, currentQuestion, currentQuestionAnswered, open, playStudyAudioSingle, quiz]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-quiz">
        <header className="modal-header">
          <h2 className="modal-title">
            Quiz
            <span className="modal-marker">• {modalContextLabel}</span>
          </h2>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleRegenerateQuiz}
              disabled={loading}
            >
              Regenerate Quiz
            </button>
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
              aria-label="Close quiz"
              title="Close quiz"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body">
          {loading ? <p className="modal-status">Generating quiz…</p> : null}
          {!loading && error ? <p className="modal-status">{error}</p> : null}
          {!loading && !error && !quiz ? <p className="modal-status">No quiz available.</p> : null}
          {!loading && !error && quiz && currentQuestion ? (
            <div className="quiz-modal-content">
              <div className="quiz-modal-header">
                <div>
                  <h3 className="quiz-modal-title">{quiz.title}</h3>
                  <p className="quiz-modal-progress">
                    Question {currentIndex + 1} of {questions.length}
                  </p>
                </div>
                {submitted && score !== null ? (
                  <div className="quiz-modal-score">
                    Score {score}/{questions.length}
                  </div>
                ) : null}
              </div>

              <div className="quiz-question-card">
                <div className="quiz-question-header">
                  <p className="quiz-question-prompt">{currentQuestion.prompt}</p>
                  <button
                    type="button"
                    className={`button button-secondary modal-icon-button ${
                      isCurrentQuestionStreaming ? 'button-active' : ''
                    }`}
                    onClick={() => {
                      if (isCurrentQuestionStreaming) {
                        stopStudyAudio();
                        return;
                      }
                      const spokenText = [
                        `Question ${currentIndex + 1}. ${currentQuestion.prompt}`,
                        'Answer choices.',
                        ...currentQuestion.options.map(
                          (option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`
                        ),
                        currentQuestionAnswered
                          ? `Correct answer. ${String.fromCharCode(65 + currentQuestion.correctIndex)}. ${
                              currentQuestion.options[currentQuestion.correctIndex] ?? ''
                            }`
                          : null,
                        currentQuestionAnswered && currentQuestion.explanation
                          ? `Explanation. ${currentQuestion.explanation}`
                          : null
                      ]
                        .filter(Boolean)
                        .join('\n\n');
                      playStudyAudioSingle({
                        text: spokenText,
                        pageKey: `${quiz.contextKey}::question-${currentIndex + 1}`
                      });
                    }}
                    aria-label={isCurrentQuestionStreaming ? 'Stop audio' : 'Play audio'}
                    title={isCurrentQuestionStreaming ? 'Stop audio' : 'Play audio'}
                  >
                    {isCurrentQuestionStreaming ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                </div>
                <label className="quiz-autoplay-toggle">
                  <input
                    type="checkbox"
                    checked={autoPlayEnabled}
                    onChange={(event) => dispatch(appActions.setQuizAutoPlayEnabled(event.target.checked))}
                  />
                  <span>Quiz audio</span>
                </label>
                <div className="quiz-question-options">
                  {currentQuestion.options.map((option, optionIndex) => {
                    const selected = answers[currentQuestion.id] === optionIndex;
                    const isCorrect = currentQuestionAnswered && currentQuestion.correctIndex === optionIndex;
                    const isWrongSelected =
                      currentQuestionAnswered && selected && currentQuestion.correctIndex !== optionIndex;
                    return (
                      <button
                        key={`${currentQuestion.id}-${optionIndex}`}
                        type="button"
                        className={`quiz-option ${
                          selected ? 'quiz-option-selected' : ''
                        } ${isCorrect ? 'quiz-option-correct' : ''} ${
                          isWrongSelected ? 'quiz-option-wrong' : ''
                        }`}
                        onClick={() => {
                          if (submitted || currentQuestionAnswered) {
                            return;
                          }
                          const answerFeedback = [
                            `Correct answer. ${String.fromCharCode(65 + currentQuestion.correctIndex)}. ${
                              currentQuestion.options[currentQuestion.correctIndex] ?? ''
                            }`,
                            currentQuestion.explanation ? `Explanation. ${currentQuestion.explanation}` : null
                          ]
                            .filter(Boolean)
                            .join('\n\n');
                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }));
                          if (autoPlayEnabled) {
                            playStudyAudioSingle({
                              text: answerFeedback,
                              pageKey: `${quiz.contextKey}::question-${currentIndex + 1}::answer`
                            });
                          }
                        }}
                        disabled={submitted || currentQuestionAnswered}
                      >
                        <span className="quiz-option-marker">{String.fromCharCode(65 + optionIndex)}</span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
                {currentQuestionAnswered && currentQuestion.explanation ? (
                  <p className="quiz-question-explanation">{currentQuestion.explanation}</p>
                ) : null}
              </div>

              <footer className="quiz-modal-footer">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                >
                  Back
                </button>
                {!submitted ? (
                  currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      className="button"
                      onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                      disabled={!currentQuestionAnswered}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      onClick={() => setSubmitted(true)}
                      disabled={answeredCount !== questions.length}
                    >
                      Finish Quiz
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      setAnswers({});
                      setCurrentIndex(0);
                      setSubmitted(false);
                    }}
                  >
                    Restart
                  </button>
                )}
              </footer>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
