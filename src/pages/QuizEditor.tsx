import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type {
  Quiz,
  Question,
  CreateQuizRequest,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CreateChoiceRequest,
  QuestionType,
  ContentType,
  CodeLanguage,
  QuestionTag,
} from "@/types";
import { CODE_LANGUAGES, CODE_LANGUAGE_LABELS } from "@/types";
import { BackButton } from "@/components";
import {
  getQuiz,
  createQuiz,
  updateQuiz,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  updateQuestionChoices,
  reorderQuestions,
  getTagsForQuiz,
  createQuizTag,
  addTagToQuestion,
  removeTagFromQuestion,
  QuizTag,
  getCourseQuiz,
  courseUpdateQuiz,
  courseCreateQuestion,
  courseUpdateQuestion,
  courseDeleteQuestion,
  courseUpdateQuestionChoices,
  courseReorderQuestions,
} from "@/lib/db";
import { CodeEditor } from "@/components/CodeEditor";
import { useToast } from "@/context/ToastContext";

export function QuizEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id || id === "new";
  const isCourse = searchParams.get("source") === "course";
  const courseId = searchParams.get("courseId");

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizTags, setQuizTags] = useState<QuizTag[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      loadQuiz(id);
    }
  }, [id, isNew]);

  const loadQuiz = async (quizId: string) => {
    try {
      const [data, tags] = await Promise.all([
        isCourse ? getCourseQuiz(quizId) : getQuiz(quizId),
        isCourse ? Promise.resolve([] as QuizTag[]) : getTagsForQuiz(quizId),
      ]);
      setQuiz(data);
      setQuizTags(tags);
      setName(data.name);
      setDescription(data.description || "");
      setShuffleQuestions(data.shuffleQuestions);
    } catch (error) {
      console.error("Failed to load quiz:", error);
      toast.error("Failed to load quiz");
      navigate("/quizzes");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuiz = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      const request: CreateQuizRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        shuffleQuestions,
      };

      if (isNew) {
        const newQuiz = await createQuiz(request);
        navigate(`/quizzes/${newQuiz.id}/edit`, { replace: true });
      } else if (id) {
        if (isCourse) {
          await courseUpdateQuiz(id, request);
        } else {
          await updateQuiz(id, request);
        }
        await loadQuiz(id);
        toast.success("Quiz saved");
      }
    } catch (error) {
      console.error("Failed to save quiz:", error);
      toast.error("Failed to save quiz");
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setShowQuestionModal(true);
  };

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setShowQuestionModal(true);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      if (isCourse) {
        await courseDeleteQuestion(questionId);
      } else {
        await deleteQuestion(questionId);
      }
      if (id) await loadQuiz(id);
      toast.success("Question deleted");
    } catch (error) {
      console.error("Failed to delete question:", error);
      toast.error("Failed to delete question");
    }
  };

  const handleSaveQuestion = async (
    request: CreateQuestionRequest | UpdateQuestionRequest,
    choices: CreateChoiceRequest[]
  ) => {
    if (!id) return;

    try {
      if (editingQuestion) {
        if (isCourse) {
          await courseUpdateQuestion(editingQuestion.id, request as UpdateQuestionRequest);
          await courseUpdateQuestionChoices(editingQuestion.id, choices);
        } else {
          await updateQuestion(editingQuestion.id, request as UpdateQuestionRequest);
          await updateQuestionChoices(editingQuestion.id, choices);
        }
        toast.success("Question updated");
      } else {
        const newQuestion = isCourse
          ? await courseCreateQuestion(id, request as CreateQuestionRequest)
          : await createQuestion(id, request as CreateQuestionRequest);
        if (choices.length > 0) {
          if (isCourse) {
            await courseUpdateQuestionChoices(newQuestion.id, choices);
          } else {
            await updateQuestionChoices(newQuestion.id, choices);
          }
        }
        toast.success("Question added");
      }
      await loadQuiz(id);
      setShowQuestionModal(false);
    } catch (error) {
      console.error("Failed to save question:", error);
      toast.error("Failed to save question");
    }
  };

  const handleMoveQuestion = async (questionId: string, direction: "up" | "down") => {
    if (!quiz) return;

    const questions = [...quiz.questions];
    const index = questions.findIndex((q) => q.id === questionId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;

    [questions[index], questions[newIndex]] = [questions[newIndex], questions[index]];

    try {
      if (isCourse) {
        await courseReorderQuestions(quiz.id, questions.map((q) => q.id));
      } else {
        await reorderQuestions(quiz.id, questions.map((q) => q.id));
      }
      if (id) await loadQuiz(id);
    } catch (error) {
      console.error("Failed to reorder questions:", error);
      toast.error("Failed to reorder questions");
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // New quiz creation - simplified layout matching NewDeck
  if (isNew) {
    return (
      <div className="min-h-full bg-[#2d2a2e]">
        <main className="max-w-xl mx-auto py-6 px-6">
          <div className="fade-in">
            {/* Back Link */}
            <BackButton
              fallbackPath="/quizzes"
              label="Back to Quizzes"
              className="inline-flex items-center text-[#78dce8] hover:text-[#ffd866] mb-6 transition-colors"
            />

            <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-6">Create New Quiz</h1>

            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866] transition-colors"
                  placeholder="e.g., JavaScript Basics"
                  maxLength={255}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866] transition-colors resize-none"
                  placeholder="What is this quiz about?"
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shuffle"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="w-4 h-4 rounded border-[#5b595c] bg-[#2d2a2e] text-[#ffd866] focus:ring-[#ffd866] focus:ring-offset-0"
                />
                <label htmlFor="shuffle" className="text-sm text-[#939293]">
                  Shuffle questions when taking quiz
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate("/quizzes")}
                  className="flex-1 px-4 py-2 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 font-medium transition-colors disabled:opacity-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuiz}
                  disabled={saving || !name.trim()}
                  className="flex-1 px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Quiz"}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton
            fallbackPath={isCourse && courseId ? `/courses/${courseId}/edit` : "/quizzes"}
            label={isCourse ? "Back to Course" : "Back to Quizzes"}
          />
          <button
            onClick={handleSaveQuiz}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg font-medium hover:bg-[#ffd866]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Quiz Details */}
        <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Quiz Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#939293] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Quiz name"
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#939293] mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="w-4 h-4 rounded border-[#5b595c] bg-[#2d2a2e] text-[#ffd866] focus:ring-[#ffd866]/50"
              />
              <span className="text-sm text-[#fcfcfa]">Shuffle questions</span>
            </label>
          </div>
        </div>

        {/* Questions Section */}
        {!isNew && (
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#fcfcfa]">
                Questions ({quiz?.questions?.length || 0})
              </h2>
              <button
                onClick={handleAddQuestion}
                className="px-3 py-1.5 bg-[#a9dc76] text-[#2d2a2e] rounded-lg text-sm font-medium hover:bg-[#a9dc76]/90 transition-colors"
              >
                + Add Question
              </button>
            </div>

            {quiz?.questions?.length === 0 ? (
              <p className="text-[#939293] text-center py-8">
                No questions yet. Add your first question to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {quiz?.questions?.map((question, index) => (
                  <QuestionRow
                    key={question.id}
                    question={question}
                    index={index}
                    total={quiz.questions.length}
                    onEdit={() => handleEditQuestion(question)}
                    onDelete={() => handleDeleteQuestion(question.id)}
                    onMoveUp={() => handleMoveQuestion(question.id, "up")}
                    onMoveDown={() => handleMoveQuestion(question.id, "down")}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {isNew && (
          <p className="text-[#939293] text-center py-8">
            Save the quiz first, then you can add questions.
          </p>
        )}
      </main>

      {/* Question Modal */}
      {showQuestionModal && id && (
        <QuestionModal
          question={editingQuestion}
          quizId={id}
          quizTags={quizTags}
          hideTags={isCourse}
          onSave={handleSaveQuestion}
          onClose={() => setShowQuestionModal(false)}
          onTagsChange={() => loadQuiz(id)}
        />
      )}
    </div>
  );
}

interface QuestionRowProps {
  question: Question;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function QuestionRow({
  question,
  index,
  total,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="flex items-start gap-3 p-3 bg-[#2d2a2e] rounded-lg">
      {/* Position controls */}
      <div className="flex flex-col gap-1">
        <button
          onClick={onMoveUp}
          disabled={index === 0}
          className="p-1 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="p-1 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Question content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[#939293]">#{index + 1}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              question.questionType === "multiple_choice"
                ? "bg-[#78dce8]/20 text-[#78dce8]"
                : "bg-[#fc9867]/20 text-[#fc9867]"
            }`}
          >
            {question.questionType === "multiple_choice" ? "Multiple Choice" : "Fill in Blank"}
          </span>
          {question.contentType === "CODE" && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#ab9df2]/20 text-[#ab9df2]">
              {question.contentLanguage || "Code"}
            </span>
          )}
        </div>
        <p className="text-[#fcfcfa] text-sm line-clamp-2 font-mono">
          {question.content}
        </p>
        {question.questionType === "multiple_choice" && (
          <p className="text-xs text-[#939293] mt-1">
            {question.choices?.length || 0} choices
            {question.multipleAnswers && " (multiple answers)"}
          </p>
        )}
        {question.tags && question.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {question.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-[#ab9df2]/20 text-[#ab9df2] px-2 py-0.5 rounded-full"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="p-2 text-[#78dce8] hover:bg-[#78dce8]/10 rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
              className="px-2 py-1 text-xs bg-[#ff6188] text-[#2d2a2e] rounded"
            >
              Yes
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 text-xs bg-[#5b595c] text-[#fcfcfa] rounded"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  );
}

interface QuestionModalProps {
  question: Question | null;
  quizId: string;
  quizTags: QuizTag[];
  hideTags?: boolean;
  onSave: (request: CreateQuestionRequest | UpdateQuestionRequest, choices: CreateChoiceRequest[]) => void;
  onClose: () => void;
  onTagsChange?: () => void;
}

function QuestionModal({ question, quizId, quizTags, hideTags, onSave, onClose, onTagsChange }: QuestionModalProps) {
  const toast = useToast();
  const [questionType, setQuestionType] = useState<QuestionType>(
    question?.questionType || "multiple_choice"
  );
  const [content, setContent] = useState(question?.content || "");
  const [contentType, setContentType] = useState<ContentType>(
    (question?.contentType as ContentType) || "TEXT"
  );
  const [contentLanguage, setContentLanguage] = useState<CodeLanguage | null>(
    question?.contentLanguage as CodeLanguage | null
  );
  const [correctAnswer, setCorrectAnswer] = useState(question?.correctAnswer || "");
  const [multipleAnswers, setMultipleAnswers] = useState(question?.multipleAnswers || false);
  const [explanation, setExplanation] = useState(question?.explanation || "");
  const [choices, setChoices] = useState<CreateChoiceRequest[]>(
    question?.choices?.map((c) => ({ text: c.text, isCorrect: c.isCorrect })) || [
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ]
  );
  const [saving, setSaving] = useState(false);

  // Tag editing state
  const [selectedTags, setSelectedTags] = useState<QuestionTag[]>(question?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset tags when question changes
  useEffect(() => {
    setSelectedTags(question?.tags || []);
    setTagInput("");
    setShowTagDropdown(false);
  }, [question]);

  // Filter available tags based on input and already selected
  const filteredTags = quizTags.filter(
    (tag) =>
      !selectedTags.some((t) => t.id === tag.id) &&
      tag.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const canCreateNewTag =
    tagInput.trim() &&
    !quizTags.some((t) => t.name.toLowerCase() === tagInput.toLowerCase()) &&
    !selectedTags.some((t) => t.name.toLowerCase() === tagInput.toLowerCase());

  const handleAddTag = async (tag: QuizTag) => {
    if (question) {
      // Existing question - add tag immediately
      try {
        await addTagToQuestion(question.id, tag.id);
        setSelectedTags((prev) => [...prev, { id: tag.id, name: tag.name }]);
        onTagsChange?.();
      } catch (error) {
        console.error("Failed to add tag:", error);
        toast.error("Failed to add tag");
      }
    } else {
      // New question - just track locally
      setSelectedTags((prev) => [...prev, { id: tag.id, name: tag.name }]);
    }
    setTagInput("");
    setShowTagDropdown(false);
  };

  const handleCreateAndAddTag = async () => {
    if (!tagInput.trim()) return;
    try {
      const newTag = await createQuizTag(quizId, tagInput.trim());
      if (question) {
        await addTagToQuestion(question.id, newTag.id);
        onTagsChange?.();
      }
      setSelectedTags((prev) => [...prev, { id: newTag.id, name: newTag.name }]);
      setTagInput("");
      setShowTagDropdown(false);
    } catch (error) {
      console.error("Failed to create tag:", error);
      toast.error("Failed to create tag");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (question) {
      try {
        await removeTagFromQuestion(question.id, tagId);
        setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
        onTagsChange?.();
      } catch (error) {
        console.error("Failed to remove tag:", error);
        toast.error("Failed to remove tag");
      }
    } else {
      setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredTags.length > 0) {
        handleAddTag(filteredTags[0]);
      } else if (canCreateNewTag) {
        handleCreateAndAddTag();
      }
    } else if (e.key === "Escape") {
      setShowTagDropdown(false);
    }
  };

  const handleAddChoice = () => {
    setChoices([...choices, { text: "", isCorrect: false }]);
  };

  const handleRemoveChoice = (index: number) => {
    if (choices.length <= 2) return;
    setChoices(choices.filter((_, i) => i !== index));
  };

  const handleChoiceChange = (index: number, field: "text" | "isCorrect", value: string | boolean) => {
    const newChoices = [...choices];
    if (field === "text") {
      newChoices[index].text = value as string;
    } else {
      newChoices[index].isCorrect = value as boolean;
    }
    setChoices(newChoices);
  };

  const handleSave = async () => {
    if (!content.trim()) return;

    setSaving(true);
    try {
      const request: CreateQuestionRequest = {
        questionType,
        content: content.trim(),
        contentType,
        contentLanguage: contentType === "CODE" ? contentLanguage || undefined : undefined,
        correctAnswer: questionType === "fill_in_blank" ? correctAnswer : undefined,
        multipleAnswers: questionType === "multiple_choice" ? multipleAnswers : undefined,
        explanation: explanation.trim() || undefined,
      };

      const validChoices =
        questionType === "multiple_choice"
          ? choices.filter((c) => c.text.trim())
          : [];

      onSave(request, validChoices);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#403e41] border border-[#5b595c] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#5b595c]">
          <h2 className="text-lg font-semibold text-[#fcfcfa]">
            {question ? "Edit Question" : "Add Question"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#5b595c]/30 rounded-lg text-[#939293] hover:text-[#fcfcfa]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* Question Type */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setQuestionType("multiple_choice")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  questionType === "multiple_choice"
                    ? "bg-[#78dce8] text-[#2d2a2e]"
                    : "bg-[#5b595c] text-[#fcfcfa] hover:bg-[#5b595c]/80"
                }`}
              >
                Multiple Choice
              </button>
              <button
                onClick={() => setQuestionType("fill_in_blank")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  questionType === "fill_in_blank"
                    ? "bg-[#fc9867] text-[#2d2a2e]"
                    : "bg-[#5b595c] text-[#fcfcfa] hover:bg-[#5b595c]/80"
                }`}
              >
                Fill in Blank
              </button>
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">Content Type</label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-[#5b595c]">
                <button
                  onClick={() => setContentType("TEXT")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    contentType === "TEXT"
                      ? "bg-[#ab9df2] text-[#2d2a2e]"
                      : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                  }`}
                >
                  Text
                </button>
                <button
                  onClick={() => {
                    setContentType("CODE");
                    if (!contentLanguage) setContentLanguage("PLAINTEXT");
                  }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    contentType === "CODE"
                      ? "bg-[#ab9df2] text-[#2d2a2e]"
                      : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                  }`}
                >
                  Code
                </button>
              </div>
              {contentType === "CODE" && (
                <select
                  value={contentLanguage || "PLAINTEXT"}
                  onChange={(e) => setContentLanguage(e.target.value as CodeLanguage)}
                  className="px-2 py-1.5 text-sm bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa]"
                >
                  {CODE_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {CODE_LANGUAGE_LABELS[lang]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Question Content */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">Question</label>
            {contentType === "CODE" ? (
              <CodeEditor
                value={content}
                onChange={setContent}
                language={contentLanguage}
                minHeight="150px"
              />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter your question..."
                rows={4}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] resize-none"
              />
            )}
          </div>

          {/* Multiple Choice Options */}
          {questionType === "multiple_choice" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[#939293]">Choices</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={multipleAnswers}
                    onChange={(e) => setMultipleAnswers(e.target.checked)}
                    className="w-4 h-4 rounded border-[#5b595c] bg-[#2d2a2e] text-[#ffd866]"
                  />
                  <span className="text-[#939293]">Multiple correct answers</span>
                </label>
              </div>
              <div className="space-y-2">
                {choices.map((choice, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type={multipleAnswers ? "checkbox" : "radio"}
                      name="correct"
                      checked={choice.isCorrect}
                      onChange={(e) => {
                        if (multipleAnswers) {
                          handleChoiceChange(index, "isCorrect", e.target.checked);
                        } else {
                          // Single answer: uncheck all others
                          const newChoices = choices.map((c, i) => ({
                            ...c,
                            isCorrect: i === index,
                          }));
                          setChoices(newChoices);
                        }
                      }}
                      className="w-4 h-4 border-[#5b595c] bg-[#2d2a2e] text-[#a9dc76]"
                    />
                    <input
                      type="text"
                      value={choice.text}
                      onChange={(e) => handleChoiceChange(index, "text", e.target.value)}
                      placeholder={`Choice ${index + 1}`}
                      className="flex-1 px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866]"
                    />
                    {choices.length > 2 && (
                      <button
                        onClick={() => handleRemoveChoice(index)}
                        className="p-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleAddChoice}
                  className="text-sm text-[#78dce8] hover:text-[#78dce8]/80"
                >
                  + Add choice
                </button>
              </div>
            </div>
          )}

          {/* Fill in Blank Answer */}
          {questionType === "fill_in_blank" && (
            <div>
              <label className="block text-sm font-medium text-[#939293] mb-2">
                Correct Answer (exact match)
              </label>
              <input
                type="text"
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                placeholder="Enter the exact correct answer"
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] font-mono"
              />
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">
              Explanation (shown after answering)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Optional explanation..."
              rows={2}
              className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] resize-none"
            />
          </div>

          {/* Tags */}
          {!hideTags && (
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">Tags</label>
            <div className="space-y-3">
              {/* Selected tags */}
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1.5 text-sm bg-[#ab9df2] text-[#2d2a2e] px-3 py-1 rounded-full"
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.id)}
                        className="hover:bg-[#2d2a2e]/20 rounded-full p-0.5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Tag input with autocomplete */}
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowTagDropdown(true);
                  }}
                  onFocus={() => setShowTagDropdown(true)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add tags..."
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ab9df2] focus:ring-1 focus:ring-[#ab9df2]/50 transition-colors"
                />

                {/* Dropdown */}
                {showTagDropdown && (filteredTags.length > 0 || canCreateNewTag) && (
                  <div
                    ref={tagDropdownRef}
                    className="absolute z-10 mt-1 w-full bg-[#403e41] border border-[#5b595c] rounded-lg shadow-lg max-h-48 overflow-auto"
                  >
                    {filteredTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="w-full text-left px-3 py-2 text-sm text-[#fcfcfa] hover:bg-[#5b595c]/50 transition-colors"
                      >
                        {tag.name}
                      </button>
                    ))}
                    {canCreateNewTag && (
                      <button
                        type="button"
                        onClick={handleCreateAndAddTag}
                        className="w-full text-left px-3 py-2 text-sm text-[#a9dc76] hover:bg-[#5b595c]/50 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create "{tagInput}"
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#5b595c] bg-[#2d2a2e]">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/30"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg font-medium hover:bg-[#ffd866]/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : question ? "Update" : "Add Question"}
          </button>
        </div>
      </div>
    </div>
  );
}
