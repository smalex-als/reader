import { useEffect, useMemo, useState } from 'react';
import type { ChapterQuiz } from '@/types/app';

interface QuizModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  chapterLabel: string;
  quiz: ChapterQuiz | null;
  onRegenerate: () => void;
  onClose: () => void;
}

export default function QuizModal({
  open,
  loading,
  error,
  chapterLabel,
  quiz,
  onRegenerate,
  onClose
}: QuizModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
  }, [open, quiz?.chapterNumber, quiz?.title]);

  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[currentIndex] ?? null;
  const currentAnswer =
    currentQuestion && Number.isInteger(answers[currentQuestion.id]) ? answers[currentQuestion.id] : null;
  const currentQuestionAnswered = currentAnswer !== null;
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

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-quiz">
        <header className="modal-header">
          <h2 className="modal-title">
            Quiz
            <span className="modal-marker">• {chapterLabel}</span>
          </h2>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onRegenerate}
              disabled={loading}
            >
              Regenerate Quiz
            </button>
            <button type="button" className="button button-ghost" onClick={onClose}>
              Close
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
                <p className="quiz-question-prompt">{currentQuestion.prompt}</p>
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
                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optionIndex }));
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
