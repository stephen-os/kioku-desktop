import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Quiz, QuizStats, Question } from "@/types";
import { getQuiz, getQuizStats, deleteQuiz, getTagsForQuiz, QuizTag, exportQuiz } from "@/lib/db";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";
import { getQuizFilename } from "@/lib/slug";
import { formatTimerDuration } from "@/lib/utils";

type FilterLogic = "any" | "all";

// Session storage key prefix for filter persistence
const FILTER_STORAGE_KEY = "quiz-filters-";

export function QuizView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [stats, setStats] = useState<QuizStats | null>(null);
  const [quizTags, setQuizTags] = useState<QuizTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Search and filter state - initialized from sessionStorage if available
  const [searchQuestion, setSearchQuestion] = useState(() => {
    if (!id) return "";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.searchQuestion || "";
      }
    } catch {}
    return "";
  });
  const [searchAnswer, setSearchAnswer] = useState(() => {
    if (!id) return "";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.searchAnswer || "";
      }
    } catch {}
    return "";
  });
  const [searchTag, setSearchTag] = useState("");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(() => {
    if (!id) return [];
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.selectedTagFilters || [];
      }
    } catch {}
    return [];
  });
  const [tagFilterMode, setTagFilterMode] = useState<FilterLogic>(() => {
    if (!id) return "any";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.tagFilterMode || "any";
      }
    } catch {}
    return "any";
  });

  // Resizable tag container - using direct DOM manipulation for smooth performance
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef({ isResizing: false, startY: 0, startHeight: 0 });

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = tagContainerRef.current;
    if (!container) return;

    resizeState.current = {
      isResizing: true,
      startY: e.clientY,
      startHeight: container.offsetHeight,
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeState.current.isResizing || !tagContainerRef.current) return;
    const delta = e.clientY - resizeState.current.startY;
    const newHeight = Math.max(64, Math.min(400, resizeState.current.startHeight + delta));
    tagContainerRef.current.style.height = `${newHeight}px`;
  };

  const handleResizeEnd = () => {
    resizeState.current.isResizing = false;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  };

  useEffect(() => {
    async function loadQuiz() {
      if (!id) return;
      try {
        const [quizData, statsData, tagsData] = await Promise.all([
          getQuiz(id),
          getQuizStats(id).catch(() => null),
          getTagsForQuiz(id).catch(() => []),
        ]);
        setQuiz(quizData);
        setStats(statsData);
        setQuizTags(tagsData);
      } catch (error) {
        console.error("Failed to load quiz:", error);
        toast.error("Failed to load quiz");
      } finally {
        setLoading(false);
      }
    }
    loadQuiz();
  }, [id]);

  // Persist filters to sessionStorage when they change
  useEffect(() => {
    if (!id) return;
    const filterState = {
      searchQuestion,
      searchAnswer,
      selectedTagFilters,
      tagFilterMode,
    };
    sessionStorage.setItem(FILTER_STORAGE_KEY + id, JSON.stringify(filterState));
  }, [id, searchQuestion, searchAnswer, selectedTagFilters, tagFilterMode]);

  // Filter tags based on tag search (for display only)
  const filteredTags = useMemo(() => {
    if (!searchTag.trim()) return quizTags;
    const term = searchTag.toLowerCase();
    return quizTags.filter((tag) => tag.name.toLowerCase().includes(term));
  }, [quizTags, searchTag]);

  // Filter questions based on search and tags
  const filteredQuestions = useMemo(() => {
    if (!quiz?.questions) return [];

    let result: Question[] = [...quiz.questions];

    // Question search
    if (searchQuestion.trim()) {
      const term = searchQuestion.toLowerCase();
      result = result.filter((q) => q.content.toLowerCase().includes(term));
    }

    // Answer search (check choices for multiple choice, correctAnswer for fill-in)
    if (searchAnswer.trim()) {
      const term = searchAnswer.toLowerCase();
      result = result.filter((q) => {
        if (q.questionType === "multiple_choice") {
          return q.choices.some((choice) => choice.text.toLowerCase().includes(term));
        } else {
          return q.correctAnswer?.toLowerCase().includes(term);
        }
      });
    }

    // Tag filter
    if (selectedTagFilters.length > 0) {
      result = result.filter((q) => {
        const questionTagIds = q.tags?.map((t) => t.id) || [];
        if (tagFilterMode === "all") {
          return selectedTagFilters.every((tagId) => questionTagIds.includes(tagId));
        } else {
          return selectedTagFilters.some((tagId) => questionTagIds.includes(tagId));
        }
      });
    }

    return result.sort((a, b) => a.position - b.position);
  }, [quiz?.questions, searchQuestion, searchAnswer, selectedTagFilters, tagFilterMode]);

  const handleToggleTagFilter = (tagId: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const clearFilters = () => {
    setSearchQuestion("");
    setSearchAnswer("");
    setSearchTag("");
    setSelectedTagFilters([]);
    setTagFilterMode("any");
  };

  const hasActiveFilters = searchQuestion.trim() !== "" || searchAnswer.trim() !== "" || selectedTagFilters.length > 0;

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteQuiz(id);
      toast.success("Quiz deleted");
      navigate("/quizzes");
    } catch (error) {
      console.error("Failed to delete quiz:", error);
      toast.error("Failed to delete quiz");
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    if (!id || !quiz) return;
    setExporting(true);
    try {
      const exportData = await exportQuiz(id);
      const filePath = await save({
        defaultPath: getQuizFilename(quiz.name),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, exportData);
        toast.success("Quiz exported");
      }
    } catch (error) {
      console.error("Failed to export quiz:", error);
      toast.error("Failed to export quiz");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#939293]">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">❓</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">Quiz not found</h1>
        <p className="text-[#939293] mb-6">
          This quiz doesn't exist or has been deleted.
        </p>
        <BackButton fallbackPath="/quizzes" label="Back to Quizzes" />
      </div>
    );
  }

  const questionCount = quiz.questions?.length || 0;

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        <div className="fade-in">
          {/* Back Link */}
          <BackButton fallbackPath="/quizzes" label="Back" />

          {/* Quiz Header */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
                    {questionCount} question{questionCount !== 1 ? "s" : ""}
                  </span>
                  {quiz.shuffleQuestions && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[#ab9df2]/20 text-[#ab9df2]">
                      Shuffle
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-2">
                  {quiz.name}
                </h1>
                <p className="text-[#939293]">
                  {quiz.description || "No description"}
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/quizzes/${id}/edit`}
                  className="px-4 py-2 bg-[#ffd866]/20 text-[#ffd866] rounded-lg hover:bg-[#ffd866]/30 font-medium transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="px-4 py-2 bg-[#ab9df2]/20 text-[#ab9df2] rounded-lg hover:bg-[#ab9df2]/30 font-medium transition-colors disabled:opacity-50"
                >
                  {exporting ? "..." : "Export"}
                </button>
                {showDeleteConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-4 py-2 bg-[#ff6188] text-[#2d2a2e] rounded-lg hover:bg-[#ff6188]/90 transition-colors disabled:opacity-50"
                    >
                      {deleting ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded-lg transition-colors"
                    title="Delete quiz"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Start Quiz Card */}
          {questionCount > 0 ? (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-8 text-center mb-6">
              <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">
                Ready to test your knowledge?
              </h2>
              <p className="text-[#939293] mb-6">
                This quiz has {questionCount} question{questionCount !== 1 ? "s" : ""}.
                {quiz.shuffleQuestions && " Questions will be shuffled."}
              </p>
              <Link
                to={`/quizzes/${id}/take`}
                className="inline-flex items-center justify-center px-8 py-3 bg-[#a9dc76] text-[#2d2a2e] rounded-lg hover:bg-[#a9dc76]/90 font-medium text-lg transition-colors"
              >
                Start Quiz
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-8 text-center mb-6">
              <div className="text-4xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-[#fcfcfa] mb-2">
                No questions yet
              </h2>
              <p className="text-[#939293] mb-6">
                Add some questions to this quiz before taking it.
              </p>
              <Link
                to={`/quizzes/${id}/edit`}
                className="inline-flex items-center justify-center px-6 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
              >
                Add Questions
              </Link>
            </div>
          )}

          {/* Stats */}
          {stats && stats.totalAttempts > 0 && (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
              <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">Your Stats</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#a9dc76] font-mono">
                    {stats.bestScore}%
                  </div>
                  <div className="text-sm text-[#939293]">Best Score</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#ffd866] font-mono">
                    {Math.round(stats.averageScore)}%
                  </div>
                  <div className="text-sm text-[#939293]">Average</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#78dce8] font-mono">
                    {stats.totalAttempts}
                  </div>
                  <div className="text-sm text-[#939293]">Attempts</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#ab9df2] font-mono">
                    {formatTimerDuration(stats.averageDurationSeconds)}
                  </div>
                  <div className="text-sm text-[#939293]">Avg Time</div>
                </div>
              </div>

              {/* Recent scores */}
              {stats.recentScores.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[#5b595c]">
                  <div className="text-sm text-[#939293] mb-2">Recent Scores</div>
                  <div className="flex gap-2">
                    {stats.recentScores.map((score, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          score >= 80
                            ? "bg-[#a9dc76]/20 text-[#a9dc76]"
                            : score >= 60
                            ? "bg-[#ffd866]/20 text-[#ffd866]"
                            : "bg-[#ff6188]/20 text-[#ff6188]"
                        }`}
                      >
                        {score}%
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Questions Preview */}
          {quiz.questions && quiz.questions.length > 0 && (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
              <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">
                Questions ({hasActiveFilters ? `${filteredQuestions.length} of ` : ""}{quiz.questions.length})
              </h3>

              {/* Search and Filter */}
              <div className="mb-4 space-y-4">
                {/* Search Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#939293] mb-1">Search Questions</label>
                    <input
                      type="text"
                      placeholder="Search question content..."
                      value={searchQuestion}
                      onChange={(e) => setSearchQuestion(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#939293] mb-1">Search Answers</label>
                    <input
                      type="text"
                      placeholder="Search answer choices..."
                      value={searchAnswer}
                      onChange={(e) => setSearchAnswer(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Tag Filters */}
                {quizTags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-[#939293]">Filter by Tags</label>
                      {/* Tag Mode Toggle */}
                      {selectedTagFilters.length > 1 && (
                        <div className="flex items-center bg-[#2d2a2e] rounded-lg p-0.5">
                          <button
                            onClick={() => setTagFilterMode("any")}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              tagFilterMode === "any"
                                ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                                : "text-[#939293] hover:text-[#fcfcfa]"
                            }`}
                          >
                            Match Any
                          </button>
                          <button
                            onClick={() => setTagFilterMode("all")}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              tagFilterMode === "all"
                                ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                                : "text-[#939293] hover:text-[#fcfcfa]"
                            }`}
                          >
                            Match All
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tag Search */}
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={searchTag}
                      onChange={(e) => setSearchTag(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ab9df2] focus:ring-1 focus:ring-[#ab9df2]/50 transition-colors text-sm"
                    />

                    {/* Selected Tags (always visible) */}
                    {selectedTagFilters.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-[#939293]">Selected:</span>
                        {selectedTagFilters.map((tagId) => {
                          const tag = quizTags.find((t) => t.id === tagId);
                          return tag ? (
                            <button
                              key={tag.id}
                              onClick={() => handleToggleTagFilter(tag.id)}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-[#ab9df2] text-[#2d2a2e] hover:bg-[#ab9df2]/80 transition-colors flex items-center gap-1"
                            >
                              {tag.name}
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}

                    {/* Available Tags (filtered by search) - Resizable */}
                    <div className="relative">
                      <div
                        ref={tagContainerRef}
                        className="flex flex-wrap content-start gap-2 overflow-y-auto p-2 bg-[#2d2a2e] rounded-lg border border-[#5b595c]"
                        style={{ height: "128px" }}
                      >
                        {filteredTags.length === 0 ? (
                          <span className="text-xs text-[#939293]">No tags match your search</span>
                        ) : (
                          filteredTags
                            .filter((tag) => !selectedTagFilters.includes(tag.id))
                            .map((tag) => (
                              <button
                                key={tag.id}
                                onClick={() => handleToggleTagFilter(tag.id)}
                                className="px-3 py-1 rounded-full text-xs font-medium bg-[#ab9df2]/20 text-[#ab9df2] hover:bg-[#ab9df2]/30 transition-colors h-fit"
                              >
                                {tag.name}
                              </button>
                            ))
                        )}
                        {filteredTags.filter((tag) => !selectedTagFilters.includes(tag.id)).length === 0 &&
                         filteredTags.length > 0 && (
                          <span className="text-xs text-[#939293]">All matching tags selected</span>
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={handleResizeStart}
                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center hover:bg-[#5b595c]/30 rounded-b-lg group"
                      >
                        <div className="w-8 h-1 bg-[#5b595c] rounded-full group-hover:bg-[#939293] transition-colors" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Filter Actions */}
                {hasActiveFilters && (
                  <div className="flex items-center gap-3 pt-2 border-t border-[#5b595c]">
                    <span className="text-sm text-[#939293]">
                      {filteredQuestions.length} question{filteredQuestions.length !== 1 ? "s" : ""} match
                    </span>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-[#ff6188] hover:text-[#ff6188]/80 transition-colors"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>

              {/* Questions List */}
              {filteredQuestions.length === 0 ? (
                <p className="text-[#939293] text-center py-4">
                  No questions match your search
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredQuestions.map((question) => (
                    <QuestionRow key={question.id} question={question} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function QuestionRow({ question }: { question: Question }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-[#2d2a2e] rounded-lg overflow-hidden">
      {/* Question Header - Clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-[#5b595c]/20 transition-colors"
      >
        <span className="text-[#939293] font-mono text-sm">
          {question.position + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-[#fcfcfa] ${isExpanded ? "whitespace-pre-wrap" : "truncate"}`}>
            {question.content}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded bg-[#5b595c]/50 text-[#939293]">
              {question.questionType === "multiple_choice"
                ? `${question.choices.length} choices`
                : "Fill in blank"}
            </span>
            {question.contentType === "CODE" && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
                Code
              </span>
            )}
            {question.tags && question.tags.length > 0 && (
              <>
                {question.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-[#ab9df2]/20 text-[#ab9df2]"
                  >
                    {tag.name}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
        {/* Expand/Collapse Icon */}
        <div className={`p-1 rounded hover:bg-[#5b595c]/50 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}>
          <svg
            className="w-5 h-5 text-[#939293]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content - Answers */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 ml-8 border-t border-[#5b595c]/50">
          {question.questionType === "multiple_choice" ? (
            <div className="space-y-2">
              <span className="text-xs text-[#939293] uppercase tracking-wider">Choices</span>
              <div className="space-y-1.5">
                {question.choices.map((choice, idx) => (
                  <div
                    key={choice.id}
                    className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                      choice.isCorrect
                        ? "bg-[#a9dc76]/20 border border-[#a9dc76]/30"
                        : "bg-[#403e41]"
                    }`}
                  >
                    <span className={`font-mono text-xs mt-0.5 ${choice.isCorrect ? "text-[#a9dc76]" : "text-[#939293]"}`}>
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className={choice.isCorrect ? "text-[#a9dc76]" : "text-[#fcfcfa]"}>
                      {choice.text}
                    </span>
                    {choice.isCorrect && (
                      <svg className="w-4 h-4 text-[#a9dc76] ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <span className="text-xs text-[#939293] uppercase tracking-wider">Correct Answer</span>
              <div className="p-2 rounded-lg bg-[#a9dc76]/20 border border-[#a9dc76]/30">
                <span className="text-[#a9dc76] text-sm">{question.correctAnswer}</span>
              </div>
            </div>
          )}

          {/* Explanation if available */}
          {question.explanation && (
            <div className="mt-3 space-y-2">
              <span className="text-xs text-[#939293] uppercase tracking-wider">Explanation</span>
              <p className="text-sm text-[#939293] whitespace-pre-wrap">{question.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
