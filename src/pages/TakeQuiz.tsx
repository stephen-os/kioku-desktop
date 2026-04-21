import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Quiz, QuestionAnswer } from "@/types";
import { CODE_LANGUAGE_LABELS } from "@/types";
import { getQuiz, startQuizAttempt, submitQuizAttempt } from "@/lib/db";
import { shuffle } from "@/lib/utils";
import { CodeBlock } from "@/components/CodeEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";

export function TakeQuiz() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

  // Shuffle questions if enabled
  const questions = useMemo(() => {
    if (!quiz?.questions) return [];
    const sorted = [...quiz.questions].sort((a, b) => a.position - b.position);
    if (quiz.shuffleQuestions) {
      return shuffle(sorted);
    }
    return sorted;
  }, [quiz]);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  useEffect(() => {
    let cancelled = false;

    // Reset state when quiz ID changes
    setAnswers({});
    setCurrentIndex(0);
    setLoading(true);
    setAttemptId(null);

    async function loadQuiz() {
      if (!id) return;
      try {
        const [quizData, attempt] = await Promise.all([
          getQuiz(id),
          startQuizAttempt(id),
        ]);
        if (cancelled) return;
        setQuiz(quizData);
        setAttemptId(attempt.id);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load quiz:", error);
        toast.error("Failed to load quiz");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Warn users when leaving mid-quiz
  useEffect(() => {
    const hasStarted = attemptId !== null && !loading;
    const hasAnswers = Object.keys(answers).length > 0;

    if (!hasStarted || !hasAnswers) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attemptId, loading, answers]);

  const handleSelectChoice = useCallback((questionId: string, choiceId: string, multipleAnswers: boolean) => {
    setAnswers(prev => {
      if (multipleAnswers) {
        // Toggle selection for multiple answers
        const current = prev[questionId] ? prev[questionId].split(",").filter(Boolean) : [];
        const index = current.indexOf(choiceId);
        if (index === -1) {
          current.push(choiceId);
        } else {
          current.splice(index, 1);
        }
        return { ...prev, [questionId]: current.join(",") };
      } else {
        // Single selection
        return { ...prev, [questionId]: choiceId };
      }
    });
  }, []);

  const handleTextAnswer = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, questions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const handleSubmit = useCallback(async () => {
    if (!attemptId) return;

    setSubmitting(true);
    try {
      const questionAnswers: QuestionAnswer[] = questions.map(q => ({
        questionId: q.id,
        answer: answers[q.id] || "",
      }));

      await submitQuizAttempt(attemptId, { answers: questionAnswers });
      navigate(`/quizzes/${id}/results/${attemptId}`);
    } catch (error) {
      console.error("Failed to submit quiz:", error);
      toast.error("Failed to submit quiz");
      setSubmitting(false);
    }
  }, [attemptId, questions, answers, navigate, id, toast]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          handleNext();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlePrev();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  // Calculate elapsed time
  const [elapsedTime, setElapsedTime] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const answeredCount = questions.filter(q => answers[q.id]).length;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#939293]">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!quiz || questions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">📝</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">No questions</h1>
        <p className="text-[#939293] mb-6">
          This quiz doesn't have any questions yet.
        </p>
        <BackButton
          fallbackPath={`/quizzes/${id}/edit`}
          label="Edit Quiz"
          className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
          showIcon={false}
        />
      </div>
    );
  }

  const isCodeQuestion = currentQuestion?.contentType === "CODE";
  const isMultipleChoice = currentQuestion?.questionType === "multiple_choice";
  const selectedChoices = answers[currentQuestion?.id]?.split(",").filter(Boolean) || [];

  return (
    <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <BackButton
              fallbackPath={`/quizzes/${id}`}
              label="Exit Quiz"
              className="text-[#78dce8] hover:text-[#ffd866] flex items-center transition-colors"
            />
            <div className="text-center">
              <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
                {quiz?.name}
              </h1>
              <p className="text-sm text-[#939293]">
                Question {currentIndex + 1} of {questions.length}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[#ffd866] font-mono text-lg">{formatTime(elapsedTime)}</div>
              <div className="text-xs text-[#939293]">{answeredCount}/{questions.length} answered</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Quiz Area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto px-6 py-8 w-full overflow-hidden">
        {/* Progress Bar */}
        <div className="mb-6 flex-shrink-0">
          <div className="bg-[#5b595c] rounded-full h-2">
            <div
              className="bg-[#ffd866] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="bg-[#403e41] rounded-2xl border border-[#5b595c] p-8">
            {/* Question Content */}
            <div className="mb-8">
              {isCodeQuestion && (
                <div className="flex items-center mb-3">
                  <span className="text-xs bg-[#78dce8]/20 text-[#78dce8] px-2 py-0.5 rounded">
                    {CODE_LANGUAGE_LABELS[currentQuestion?.contentLanguage || "PLAINTEXT"]}
                  </span>
                </div>
              )}
              {isCodeQuestion ? (
                <CodeBlock
                  code={currentQuestion?.content || ""}
                  language={currentQuestion?.contentLanguage}
                />
              ) : (
                <p className="text-xl text-[#fcfcfa] whitespace-pre-wrap">
                  {currentQuestion?.content}
                </p>
              )}
            </div>

            {/* Answer Area */}
            {isMultipleChoice ? (
              <div className="space-y-3">
                {currentQuestion?.multipleAnswers && (
                  <p className="text-sm text-[#78dce8] mb-4">
                    Select all that apply
                  </p>
                )}
                {currentQuestion?.choices
                  .sort((a, b) => a.position - b.position)
                  .map((choice) => {
                    const isSelected = selectedChoices.includes(choice.id);
                    return (
                      <button
                        key={choice.id}
                        onClick={() => handleSelectChoice(
                          currentQuestion.id,
                          choice.id,
                          currentQuestion.multipleAnswers
                        )}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                          isSelected
                            ? "bg-[#ffd866]/20 border-[#ffd866] text-[#fcfcfa]"
                            : "bg-[#2d2a2e] border-[#5b595c] text-[#fcfcfa] hover:border-[#939293]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded ${
                            currentQuestion.multipleAnswers ? "rounded" : "rounded-full"
                          } border-2 flex items-center justify-center ${
                            isSelected
                              ? "border-[#ffd866] bg-[#ffd866]"
                              : "border-[#5b595c]"
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-[#2d2a2e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span>{choice.text}</span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div>
                <label className="block text-sm text-[#939293] uppercase tracking-wider mb-2">
                  Your Answer
                </label>
                <input
                  type="text"
                  value={answers[currentQuestion?.id] || ""}
                  onChange={(e) => handleTextAnswer(currentQuestion?.id, e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full px-4 py-3 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 font-mono"
                />
                <p className="mt-2 text-xs text-[#939293]">
                  Answer must match exactly (case-sensitive)
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-6 flex justify-between items-center flex-shrink-0">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          {/* Question Navigator */}
          <div className="flex gap-1 flex-wrap justify-center max-w-md">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                  idx === currentIndex
                    ? "bg-[#ffd866] text-[#2d2a2e]"
                    : answers[q.id]
                    ? "bg-[#a9dc76]/30 text-[#a9dc76]"
                    : "bg-[#5b595c]/30 text-[#939293] hover:bg-[#5b595c]/50"
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          {currentIndex === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-[#a9dc76] text-[#2d2a2e] rounded-lg hover:bg-[#a9dc76]/90 flex items-center gap-2 font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#2d2a2e] border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Quiz
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
            >
              Next
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="mt-6 text-center text-sm text-[#939293] flex-shrink-0">
          <div className="inline-flex items-center gap-6">
            <span>
              <kbd className="px-2 py-1 bg-[#5b595c]/50 rounded text-xs text-[#fcfcfa]">←</kbd> Previous
            </span>
            <span>
              <kbd className="px-2 py-1 bg-[#5b595c]/50 rounded text-xs text-[#fcfcfa]">→</kbd> Next
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
