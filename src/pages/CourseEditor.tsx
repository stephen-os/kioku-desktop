import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Course, Lesson, Deck, Quiz } from "@/types";
import { BackButton } from "@/components";
import {
  getCourseWithLessons,
  createCourse,
  updateCourse,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
  courseAddItem,
  removeLessonItem,
  reorderLessonItems,
  getAllDecks,
  getAllQuizzes,
  resetCourseProgress,
} from "@/lib/db";
import { useToast } from "@/context/ToastContext";

export function CourseEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id;

  const [course, setCourse] = useState<Course | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Available items to add
  const [decks, setDecks] = useState<Deck[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);

  // Modal states
  const [showAddLessonModal, setShowAddLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [targetLessonId, setTargetLessonId] = useState<string | null>(null);
  const [addItemType, setAddItemType] = useState<"deck" | "quiz">("deck");
  const [searchTerm, setSearchTerm] = useState("");

  // Lesson form
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonDescription, setLessonDescription] = useState("");

  // Reset-progress flow (requires typing the course name to confirm)
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleResetProgress = async () => {
    if (!id || !course || resetConfirmText !== course.name) return;
    setResetting(true);
    try {
      await resetCourseProgress(id);
      toast.success("Course progress reset");
      setShowResetConfirm(false);
      setResetConfirmText("");
      await loadData();
    } catch (error) {
      console.error("Failed to reset course progress:", error);
      toast.error("Failed to reset course progress");
    } finally {
      setResetting(false);
    }
  };


  const loadData = useCallback(async () => {
    try {
      const [decksData, quizzesData] = await Promise.all([
        getAllDecks(),
        getAllQuizzes(),
      ]);
      setDecks(decksData);
      setQuizzes(quizzesData);

      if (!isNew && id) {
        const courseData = await getCourseWithLessons(id);
        if (courseData) {
          setCourse(courseData);
          setName(courseData.name);
          setDescription(courseData.description || "");
        } else {
          toast.error("Course not found");
          navigate("/courses");
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [id, isNew, toast, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Course name is required");
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const newCourse = await createCourse({
          name: name.trim(),
          description: description.trim() || undefined,
        });
        toast.success("Course created");
        navigate(`/courses/${newCourse.id}/edit`, { replace: true });
      } else if (id) {
        await updateCourse(id, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
        toast.success("Course saved");
        loadData();
      }
    } catch (error) {
      console.error("Failed to save course:", error);
      toast.error("Failed to save course");
    } finally {
      setSaving(false);
    }
  };

  // Lesson operations
  const handleAddLesson = async () => {
    if (!id || !lessonTitle.trim()) return;

    try {
      await createLesson(id, {
        title: lessonTitle.trim(),
        description: lessonDescription.trim() || undefined,
      });
      setShowAddLessonModal(false);
      setLessonTitle("");
      setLessonDescription("");
      loadData();
      toast.success("Lesson added");
    } catch (error) {
      console.error("Failed to add lesson:", error);
      toast.error("Failed to add lesson");
    }
  };

  const handleUpdateLesson = async () => {
    if (!editingLesson || !lessonTitle.trim()) return;

    try {
      await updateLesson(editingLesson.id, {
        title: lessonTitle.trim(),
        description: lessonDescription.trim() || undefined,
      });
      setEditingLesson(null);
      setLessonTitle("");
      setLessonDescription("");
      loadData();
      toast.success("Lesson updated");
    } catch (error) {
      console.error("Failed to update lesson:", error);
      toast.error("Failed to update lesson");
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    try {
      await deleteLesson(lessonId);
      loadData();
      toast.success("Lesson deleted");
    } catch (error) {
      console.error("Failed to delete lesson:", error);
      toast.error("Failed to delete lesson");
    }
  };

  const handleMoveLesson = async (index: number, direction: "up" | "down") => {
    if (!id || !course?.lessons) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= course.lessons.length) return;

    const newLessons = [...course.lessons];
    const [moved] = newLessons.splice(index, 1);
    newLessons.splice(newIndex, 0, moved);

    const lessonIds = newLessons.map((l) => l.id);

    try {
      await reorderLessons(id, { lessonIds });
      loadData();
    } catch (error) {
      console.error("Failed to reorder lessons:", error);
      toast.error("Failed to reorder lessons");
    }
  };

  // Item operations
  const handleAddItem = async (itemType: "deck" | "quiz", itemId: string, itemName: string) => {
    if (!targetLessonId) return;

    try {
      // Copy the library item into the course (the course then OWNS the copy).
      await courseAddItem({
        lessonId: targetLessonId,
        itemType,
        mode: "library",
        sourceId: itemId,
        name: itemName,
      });
      setShowAddItemModal(false);
      setSearchTerm("");
      loadData();
      toast.success(`${itemType === "deck" ? "Deck" : "Quiz"} copied into lesson`);
    } catch (error) {
      console.error("Failed to add item:", error);
      toast.error("Failed to add item");
    }
  };

  const handleRemoveItem = async (lessonItemId: string) => {
    try {
      await removeLessonItem(lessonItemId);
      loadData();
    } catch (error) {
      console.error("Failed to remove item:", error);
      toast.error("Failed to remove item");
    }
  };

  const handleMoveItem = async (lesson: Lesson, index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= lesson.items.length) return;

    const newItems = [...lesson.items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(newIndex, 0, moved);

    const itemIds = newItems.map((item) => item.id);

    try {
      await reorderLessonItems(lesson.id, { itemIds });
      loadData();
    } catch (error) {
      console.error("Failed to reorder items:", error);
      toast.error("Failed to reorder items");
    }
  };

  // Get items already in a lesson
  const getLessonItemIds = (lessonId: string) => {
    const lesson = course?.lessons?.find(l => l.id === lessonId);
    return new Set(lesson?.items.map(i => i.itemId) || []);
  };

  // Filter available items for a lesson
  const getAvailableItems = (lessonId: string) => {
    const usedIds = getLessonItemIds(lessonId);
    return {
      decks: decks.filter(d => !usedIds.has(d.id)),
      quizzes: quizzes.filter(q => !usedIds.has(q.id)),
    };
  };

  const openEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setLessonTitle(lesson.title);
    setLessonDescription(lesson.description || "");
  };

  const openAddItemModal = (lessonId: string) => {
    setTargetLessonId(lessonId);
    setShowAddItemModal(true);
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#939293]">Loading...</p>
        </div>
      </div>
    );
  }

  const { decks: availableDecks, quizzes: availableQuizzes } = targetLessonId
    ? getAvailableItems(targetLessonId)
    : { decks: [], quizzes: [] };

  const filteredDecks = availableDecks.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredQuizzes = availableQuizzes.filter(q =>
    q.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        <div className="fade-in">
          {/* Back link */}
          <BackButton
            fallbackPath={isNew ? "/courses" : `/courses/${id}`}
            label={isNew ? "Back to Courses" : "Back to Course"}
          />

          {/* Course Info Form */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">
              {isNew ? "Create New Course" : "Edit Course"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Name <span className="text-[#ff6188]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Course name"
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Course description (optional)"
                  rows={3}
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866] resize-none"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#ffd866]/90 transition-colors font-medium disabled:opacity-50"
              >
                {saving ? "Saving..." : isNew ? "Create Course" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Lessons - only show after course is created */}
          {!isNew && course && (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#fcfcfa]">Lessons</h2>
                <button
                  onClick={() => {
                    setShowAddLessonModal(true);
                    setLessonTitle("");
                    setLessonDescription("");
                  }}
                  className="px-3 py-1.5 bg-[#a9dc76]/20 text-[#a9dc76] text-sm rounded-lg hover:bg-[#a9dc76]/30 transition-colors font-medium"
                >
                  + Add Lesson
                </button>
              </div>

              {course.lessons && course.lessons.length > 0 ? (
                <div className="space-y-4">
                  {course.lessons.map((lesson, lessonIndex) => (
                    <LessonEditor
                      key={lesson.id}
                      lesson={lesson}
                      index={lessonIndex}
                      totalLessons={course.lessons.length}
                      onEdit={() => openEditLesson(lesson)}
                      onDelete={() => handleDeleteLesson(lesson.id)}
                      onMove={(dir) => handleMoveLesson(lessonIndex, dir)}
                      onAddItem={() => openAddItemModal(lesson.id)}
                      onRemoveItem={handleRemoveItem}
                      onMoveItem={(idx, dir) => handleMoveItem(lesson, idx, dir)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[#939293]">
                  <p>No lessons in this course yet.</p>
                  <p className="text-sm mt-1">Add lessons to organize your learning path.</p>
                </div>
              )}
            </div>
          )}

          {/* Reset progress */}
          {!isNew && course && (
            <div className="bg-[#403e41] rounded-xl border border-[#ff6188]/30 p-6 mt-6">
              <h2 className="text-lg font-semibold text-[#fcfcfa] mb-1">Reset progress</h2>
              <p className="text-sm text-[#939293] mb-4">
                Clears all completion for this course. Your decks, quizzes, and lessons are not deleted.
              </p>
              {!showResetConfirm ? (
                <button
                  onClick={() => {
                    setShowResetConfirm(true);
                    setResetConfirmText("");
                  }}
                  className="px-4 py-2 text-[#ff6188] border border-[#ff6188]/40 text-sm rounded-lg hover:bg-[#ff6188]/10 transition-colors font-medium"
                >
                  Reset course progress
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[#fcfcfa]">
                    Type <span className="font-mono text-[#ffd866]">{course.name}</span> to confirm.
                  </p>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Course name"
                    className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ff6188]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleResetProgress}
                      disabled={resetting || resetConfirmText !== course.name}
                      className="px-4 py-2 bg-[#ff6188] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#ff6188]/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resetting ? "Resetting..." : "Confirm reset"}
                    </button>
                    <button
                      onClick={() => {
                        setShowResetConfirm(false);
                        setResetConfirmText("");
                      }}
                      className="px-4 py-2 border border-[#5b595c] text-[#fcfcfa] text-sm rounded-lg hover:bg-[#5b595c]/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit Lesson Modal */}
      {(showAddLessonModal || editingLesson) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">
              {editingLesson ? "Edit Lesson" : "Add Lesson"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Title <span className="text-[#ff6188]">*</span>
                </label>
                <input
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Lesson title"
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#939293] mb-1">
                  Description
                </label>
                <textarea
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                  placeholder="Lesson description (optional)"
                  rows={3}
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866] resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowAddLessonModal(false);
                    setEditingLesson(null);
                    setLessonTitle("");
                    setLessonDescription("");
                  }}
                  className="px-4 py-2 text-[#939293] hover:text-[#fcfcfa] text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={editingLesson ? handleUpdateLesson : handleAddLesson}
                  disabled={!lessonTitle.trim()}
                  className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#ffd866]/90 transition-colors font-medium disabled:opacity-50"
                >
                  {editingLesson ? "Save" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="p-4 border-b border-[#5b595c]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-[#fcfcfa]">Add to Lesson</h3>
                <button
                  onClick={() => {
                    setShowAddItemModal(false);
                    setSearchTerm("");
                  }}
                  className="p-1 text-[#939293] hover:text-[#fcfcfa]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setAddItemType("deck")}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                    addItemType === "deck"
                      ? "bg-[#78dce8]/20 text-[#78dce8]"
                      : "bg-[#2d2a2e] text-[#939293] hover:text-[#fcfcfa]"
                  }`}
                >
                  Decks ({availableDecks.length})
                </button>
                <button
                  onClick={() => setAddItemType("quiz")}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                    addItemType === "quiz"
                      ? "bg-[#ab9df2]/20 text-[#ab9df2]"
                      : "bg-[#2d2a2e] text-[#939293] hover:text-[#fcfcfa]"
                  }`}
                >
                  Quizzes ({availableQuizzes.length})
                </button>
              </div>

              {/* Search */}
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${addItemType === "deck" ? "decks" : "quizzes"}...`}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#5b595c] focus:outline-none focus:border-[#ffd866]"
              />
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-y-auto p-4">
              {addItemType === "deck" ? (
                filteredDecks.length > 0 ? (
                  <div className="space-y-2">
                    {filteredDecks.map((deck) => (
                      <button
                        key={deck.id}
                        onClick={() => handleAddItem("deck", deck.id, deck.name)}
                        className="w-full text-left p-3 bg-[#2d2a2e] rounded-lg border border-[#5b595c] hover:border-[#78dce8] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[#fcfcfa] font-medium">{deck.name}</span>
                          <span className="text-xs text-[#939293]">
                            {deck.cardCount ?? 0} cards
                          </span>
                        </div>
                        {deck.description && (
                          <p className="text-sm text-[#939293] mt-1 line-clamp-1">
                            {deck.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[#939293]">
                    {availableDecks.length === 0
                      ? "All decks have been added to this lesson."
                      : "No decks match your search."}
                  </div>
                )
              ) : filteredQuizzes.length > 0 ? (
                <div className="space-y-2">
                  {filteredQuizzes.map((quiz) => (
                    <button
                      key={quiz.id}
                      onClick={() => handleAddItem("quiz", quiz.id, quiz.name)}
                      className="w-full text-left p-3 bg-[#2d2a2e] rounded-lg border border-[#5b595c] hover:border-[#ab9df2] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[#fcfcfa] font-medium">{quiz.name}</span>
                        <span className="text-xs text-[#939293]">
                          {quiz.questionCount ?? quiz.questions?.length ?? 0} questions
                        </span>
                      </div>
                      {quiz.description && (
                        <p className="text-sm text-[#939293] mt-1 line-clamp-1">
                          {quiz.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[#939293]">
                  {availableQuizzes.length === 0
                    ? "All quizzes have been added to this lesson."
                    : "No quizzes match your search."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface LessonEditorProps {
  lesson: Lesson;
  index: number;
  totalLessons: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  onAddItem: () => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (index: number, direction: "up" | "down") => void;
}

function LessonEditor({
  lesson,
  index,
  totalLessons,
  onEdit,
  onDelete,
  onMove,
  onAddItem,
  onRemoveItem,
  onMoveItem,
}: LessonEditorProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-[#2d2a2e] rounded-lg border border-[#5b595c]">
      {/* Lesson header */}
      <div className="flex items-center gap-3 p-3">
        {/* Order number and move buttons */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-[#939293] w-6 text-center">
            {index + 1}
          </span>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onMove("up")}
              disabled={index === 0}
              className="p-0.5 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              onClick={() => onMove("down")}
              disabled={index === totalLessons - 1}
              className="p-0.5 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 text-[#939293] hover:text-[#fcfcfa]"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Lesson info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-[#fcfcfa] font-medium truncate">{lesson.title}</h3>
          {lesson.description && (
            <p className="text-xs text-[#939293] truncate">{lesson.description}</p>
          )}
        </div>

        {/* Item count */}
        <span className="text-xs px-2 py-0.5 rounded bg-[#5b595c] text-[#939293]">
          {lesson.items.length} items
        </span>

        {/* Actions */}
        <button
          onClick={onEdit}
          className="p-1.5 text-[#939293] hover:text-[#fcfcfa] hover:bg-[#5b595c] rounded transition-colors"
          title="Edit lesson"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {showDeleteConfirm ? (
          <div className="flex gap-1">
            <button
              onClick={onDelete}
              className="px-2 py-1 bg-[#ff6188] text-[#2d2a2e] text-xs rounded hover:bg-[#ff6188]/90"
            >
              Yes
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 bg-[#5b595c] text-[#fcfcfa] text-xs rounded hover:bg-[#5b595c]/80"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-[#ff6188] hover:bg-[#ff6188]/10 rounded transition-colors"
            title="Delete lesson"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>

      {/* Lesson items */}
      {isExpanded && (
        <div className="border-t border-[#5b595c] p-3">
          {lesson.items.length > 0 ? (
            <div className="space-y-2 mb-3">
              {lesson.items.map((item, itemIndex) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-[#403e41] rounded border border-[#5b595c]"
                >
                  {/* Move buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => onMoveItem(itemIndex, "up")}
                      disabled={itemIndex === 0}
                      className="p-0.5 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onMoveItem(itemIndex, "down")}
                      disabled={itemIndex === lesson.items.length - 1}
                      className="p-0.5 text-[#939293] hover:text-[#fcfcfa] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Item type badge */}
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      item.isMissing
                        ? "bg-[#ff6188]/20 text-[#ff6188]"
                        : item.itemType === "deck"
                        ? "bg-[#78dce8]/20 text-[#78dce8]"
                        : "bg-[#ab9df2]/20 text-[#ab9df2]"
                    }`}
                  >
                    {item.isMissing ? "Missing" : item.itemType === "deck" ? "Deck" : "Quiz"}
                  </span>

                  {/* Item name */}
                  <span className={`flex-1 text-sm truncate ${item.isMissing ? "text-[#ff6188]" : "text-[#fcfcfa]"}`}>
                    {item.itemName}
                  </span>

                  {/* Requirement badge */}
                  {item.requirementType && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[#ffd866]/20 text-[#ffd866]">
                      {item.requirementType === "min_score" ? `≥${item.requirementValue}%` : item.requirementType}
                    </span>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1 text-[#ff6188] hover:bg-[#ff6188]/10 rounded transition-colors"
                    title="Remove from lesson"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#939293] mb-3">No items in this lesson.</p>
          )}

          <button
            onClick={onAddItem}
            className="text-sm text-[#a9dc76] hover:text-[#a9dc76]/80"
          >
            + Add deck or quiz
          </button>
        </div>
      )}
    </div>
  );
}
