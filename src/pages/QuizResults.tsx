import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Quiz, QuizAttempt, Question } from "@/types";
import { CODE_LANGUAGE_LABELS } from "@/types";
import { getQuiz, getQuizAttempt } from "@/lib/db";
import { CodeBlock } from "@/components/CodeEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";
import { formatTimerDuration } from "@/lib/utils";

export function QuizResults() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  useEffect(() => {
    async function loadResults() {
      if (!id || !attemptId) return;
      try {
        const [quizData, attemptData] = await Promise.all([
          getQuiz(id),
          getQuizAttempt(attemptId),
        ]);
        setQuiz(quizData);
        setAttempt(attemptData);
      } catch (error) {
        console.error("Failed to load results:", error);
        toast.error("Failed to load quiz results");
      } finally {
        setLoading(false);
      }
    }
    loadResults();
  }, [id, attemptId, toast]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[#a9dc76]";
    if (score >= 60) return "text-[#ffd866]";
    return "text-[#ff6188]";
  };

  const getScoreEmoji = (score: number) => {
    if (score === 100) return "🏆";
    if (score >= 80) return "🎉";
    if (score >= 60) return "👍";
    if (score >= 40) return "📚";
    return "💪";
  };

  // Get question by ID from quiz
  const getQuestion = (questionId: string): Question | undefined => {
    return quiz?.questions.find(q => q.id === questionId);
  };

  // Get incorrect answers for review
  const incorrectResults = attempt?.questionResults.filter(r => !r.isCorrect) || [];
  const currentReviewResult = incorrectResults[reviewIndex];
  const currentReviewQuestion = currentReviewResult ? getQuestion(currentReviewResult.questionId) : null;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#939293]">Loading results...</p>
        </div>
      </div>
    );
  }

  if (!quiz || !attempt) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">❓</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">Results not found</h1>
        <p className="text-[#939293] mb-6">
          We couldn't find the quiz results you're looking for.
        </p>
        <BackButton
          fallbackPath="/quizzes"
          label="Back to Quizzes"
          className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
          showIcon={false}
        />
      </div>
    );
  }

  if (showReview && currentReviewQuestion) {
    const isCodeQuestion = currentReviewQuestion.contentType === "CODE";
    const isMultipleChoice = currentReviewQuestion.questionType === "multiple_choice";

    // Get the user's answer
    const userAnswerIds = currentReviewResult?.userAnswer?.split(",").filter(Boolean) || [];

    return (
      <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setShowReview(false)}
                className="text-[#78dce8] hover:text-[#ffd866] flex items-center transition-colors"
              >
                <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Results
              </button>
              <div className="text-center">
                <h1 className="text-xl font-bold text-[#fcfcfa] font-mono">
                  Review Incorrect Answers
                </h1>
                <p className="text-sm text-[#939293]">
                  {reviewIndex + 1} of {incorrectResults.length}
                </p>
              </div>
              <div className="w-24" />
            </div>
          </div>
        </div>

        {/* Review Content */}
        <div className="flex-1 flex flex-col max-w-4xl mx-auto px-6 py-8 w-full overflow-hidden">
          {/* Progress */}
          <div className="mb-6 flex-shrink-0">
            <div className="bg-[#5b595c] rounded-full h-2">
              <div
                className="bg-[#ff6188] h-2 rounded-full transition-all duration-300"
                style={{ width: `${((reviewIndex + 1) / incorrectResults.length) * 100}%` }}
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
                      {CODE_LANGUAGE_LABELS[currentReviewQuestion.contentLanguage || "PLAINTEXT"]}
                    </span>
                  </div>
                )}
                {isCodeQuestion ? (
                  <CodeBlock
                    code={currentReviewQuestion.content}
                    language={currentReviewQuestion.contentLanguage}
                  />
                ) : (
                  <p className="text-xl text-[#fcfcfa] whitespace-pre-wrap">
                    {currentReviewQuestion.content}
                  </p>
                )}
              </div>

              {/* Answers */}
              {isMultipleChoice ? (
                <div className="space-y-3">
                  {currentReviewQuestion.choices
                    .sort((a, b) => a.position - b.position)
                    .map((choice) => {
                      const wasSelected = userAnswerIds.includes(choice.id);
                      const isCorrect = choice.isCorrect;

                      let bgColor = "bg-[#2d2a2e]";
                      let borderColor = "border-[#5b595c]";

                      if (isCorrect) {
                        bgColor = "bg-[#a9dc76]/20";
                        borderColor = "border-[#a9dc76]";
                      } else if (wasSelected) {
                        bgColor = "bg-[#ff6188]/20";
                        borderColor = "border-[#ff6188]";
                      }

                      return (
                        <div
                          key={choice.id}
                          className={`px-4 py-3 rounded-lg border ${bgColor} ${borderColor}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded flex items-center justify-center ${
                              isCorrect
                                ? "bg-[#a9dc76] text-[#2d2a2e]"
                                : wasSelected
                                ? "bg-[#ff6188] text-[#2d2a2e]"
                                : "border-2 border-[#5b595c]"
                            }`}>
                              {isCorrect && (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {wasSelected && !isCorrect && (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </div>
                            <span className={`${isCorrect ? "text-[#a9dc76]" : wasSelected ? "text-[#ff6188]" : "text-[#fcfcfa]"}`}>
                              {choice.text}
                            </span>
                            {isCorrect && (
                              <span className="ml-auto text-xs text-[#a9dc76]">Correct</span>
                            )}
                            {wasSelected && !isCorrect && (
                              <span className="ml-auto text-xs text-[#ff6188]">Your answer</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-[#ff6188] bg-[#ff6188]/20">
                    <div className="text-xs text-[#ff6188] uppercase tracking-wider mb-1">Your Answer</div>
                    <div className="text-[#fcfcfa] font-mono">
                      {currentReviewResult?.userAnswer || "(no answer)"}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-[#a9dc76] bg-[#a9dc76]/20">
                    <div className="text-xs text-[#a9dc76] uppercase tracking-wider mb-1">Correct Answer</div>
                    <div className="text-[#fcfcfa] font-mono">
                      {currentReviewQuestion.correctAnswer}
                    </div>
                  </div>
                </div>
              )}

              {/* Explanation */}
              {currentReviewQuestion.explanation && (
                <div className="mt-6 pt-6 border-t border-[#5b595c]">
                  <div className="text-xs text-[#939293] uppercase tracking-wider mb-2">
                    Explanation
                  </div>
                  <p className="text-[#fcfcfa]">{currentReviewQuestion.explanation}</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex justify-between items-center flex-shrink-0">
            <button
              onClick={() => setReviewIndex(prev => prev - 1)}
              disabled={reviewIndex === 0}
              className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            {reviewIndex === incorrectResults.length - 1 ? (
              <button
                onClick={() => setShowReview(false)}
                className="px-6 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 flex items-center gap-2 font-medium transition-colors"
              >
                Done Reviewing
              </button>
            ) : (
              <button
                onClick={() => setReviewIndex(prev => prev + 1)}
                className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
              >
                Next
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <BackButton
              fallbackPath={`/quizzes/${id}`}
              label="Back to Quiz"
              className="text-[#78dce8] hover:text-[#ffd866] flex items-center transition-colors"
            />
            <div className="text-center">
              <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
                {quiz.name}
              </h1>
              <p className="text-sm text-[#939293]">Quiz Results</p>
            </div>
            <div className="w-24" />
          </div>
        </div>
      </div>

      {/* Results Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Score Card */}
          <div className="bg-[#403e41] rounded-2xl border border-[#5b595c] p-12 text-center mb-8">
            <div className="text-6xl mb-4">{getScoreEmoji(attempt.scorePercentage)}</div>
            <div className={`text-7xl font-bold font-mono ${getScoreColor(attempt.scorePercentage)}`}>
              {Math.round(attempt.scorePercentage)}%
            </div>
            <p className="text-[#939293] mt-4 text-lg">
              {attempt.correctAnswers} of {attempt.totalQuestions} questions correct
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 text-center">
              <div className="text-3xl font-bold text-[#a9dc76] font-mono">
                {attempt.correctAnswers}
              </div>
              <div className="text-sm text-[#939293] mt-1">Correct</div>
            </div>
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 text-center">
              <div className="text-3xl font-bold text-[#ff6188] font-mono">
                {attempt.totalQuestions - attempt.correctAnswers}
              </div>
              <div className="text-sm text-[#939293] mt-1">Incorrect</div>
            </div>
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 text-center">
              <div className="text-3xl font-bold text-[#78dce8] font-mono">
                {formatTimerDuration(attempt.durationSeconds)}
              </div>
              <div className="text-sm text-[#939293] mt-1">Time</div>
            </div>
          </div>

          {/* Question Breakdown */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-8">
            <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">Question Breakdown</h3>
            <div className="flex flex-wrap gap-2">
              {attempt.questionResults.map((result, idx) => (
                <div
                  key={result.id}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium ${
                    result.isCorrect
                      ? "bg-[#a9dc76]/30 text-[#a9dc76]"
                      : "bg-[#ff6188]/30 text-[#ff6188]"
                  }`}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            {incorrectResults.length > 0 && (
              <button
                onClick={() => {
                  setReviewIndex(0);
                  setShowReview(true);
                }}
                className="flex-1 px-6 py-3 bg-[#ff6188]/20 text-[#ff6188] rounded-lg hover:bg-[#ff6188]/30 font-medium transition-colors"
              >
                Review {incorrectResults.length} Incorrect Answer{incorrectResults.length !== 1 ? "s" : ""}
              </button>
            )}
            <Link
              to={`/quizzes/${id}/take`}
              className="flex-1 px-6 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors text-center"
            >
              Take Again
            </Link>
            <Link
              to="/quizzes"
              className="flex-1 px-6 py-3 border border-[#5b595c] rounded-lg text-[#fcfcfa] hover:bg-[#5b595c]/30 font-medium transition-colors text-center"
            >
              All Quizzes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
