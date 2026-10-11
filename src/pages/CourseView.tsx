import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { Course, Lesson, LessonItem } from "@/types";
import {
  getCourseWithLessons,
  deleteCourse,
  toggleCourseFavorite,
  recordLessonProgress,
  clearLessonItemProgress,
  linkCourseItems,
  adoptCourseDeck,
  adoptCourseQuiz,
  adoptCoursePage,
} from "@/lib/db";
import { FavoriteButton, BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";

// Build a study/quiz launch URL that carries course context so the session can
// record progress and return the user to the course on completion.
function courseLaunchUrl(courseId: string, lessonId: string, item: LessonItem): string {
  const base =
    item.itemType === "deck"
      ? `/decks/${item.itemId}/study`
      : item.itemType === "quiz"
      ? `/quizzes/${item.itemId}/take`
      : `/course-note/${item.itemId}`;
  const ctx = new URLSearchParams({ courseId, lessonId, lessonItemId: item.id, source: "course" });
  if (item.requirementType === "min_score" && item.requirementValue != null) {
    ctx.set("minScore", String(item.requirementValue));
  }
  return `${base}?${ctx.toString()}`;
}

export function CourseView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);

  const loadCourse = useCallback(async (): Promise<void> => {
    if (!id) return;
    try {
      const courseData = await getCourseWithLessons(id);
      setCourse(courseData);
      // Expand all lessons by default
      if (courseData) {
        setExpandedLessons(new Set(courseData.lessons.map(l => l.id)));
      }
    } catch (error) {
      console.error("Failed to load course:", error);
      toast.error("Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const handleDelete = async (): Promise<void> => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteCourse(id);
      toast.success("Course deleted");
      navigate("/courses");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete course");
      setDeleting(false);
    }
  };

  const handleToggleFavorite = async (): Promise<void> => {
    if (!id) return;
    try {
      await toggleCourseFavorite(id);
      loadCourse();
    } catch (error) {
      toast.error("Failed to update favorite");
    }
  };

  const handleAdopt = async (item: LessonItem): Promise<void> => {
    if (!item.itemId) return;
    try {
      if (item.itemType === "deck") await adoptCourseDeck(item.itemId);
      else if (item.itemType === "quiz") await adoptCourseQuiz(item.itemId);
      else await adoptCoursePage(item.itemId);
      toast.success("Saved a personal copy to your library");
    } catch (error) {
      console.error("Failed to adopt item:", error);
      toast.error("Failed to save a copy");
    }
  };

  const handleToggleItemComplete = async (lesson: Lesson, item: LessonItem): Promise<void> => {
    if (!id) return;
    try {
      if (item.isCompleted) {
        await clearLessonItemProgress(item.id);
      } else {
        await recordLessonProgress(id, lesson.id, item.id);
      }
      loadCourse();
    } catch (error) {
      toast.error("Failed to update progress");
    }
  };

  const handleLinkItems = async (): Promise<void> => {
    if (!id) return;
    setLinking(true);
    try {
      const result = await linkCourseItems(id);
      if (result.itemsLinked > 0) {
        toast.success(`Linked ${result.itemsLinked} items`);
        loadCourse();
      } else {
        toast.info("No new items to link");
      }
    } catch (error) {
      toast.error("Failed to link items");
    } finally {
      setLinking(false);
    }
  };

  const toggleLesson = (lessonId: string) => {
    setExpandedLessons(prev => {
      const next = new Set(prev);
      if (next.has(lessonId)) {
        next.delete(lessonId);
      } else {
        next.add(lessonId);
      }
      return next;
    });
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

  if (!course) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <h3 className="text-lg font-medium text-[#fcfcfa]">Course not found</h3>
          <Link to="/courses" className="text-[#ffd866] hover:underline mt-2 inline-block">
            Back to Courses
          </Link>
        </div>
      </div>
    );
  }

  const lessonCount = course.lessons?.length ?? 0;
  const completedLessonCount = course.lessons?.filter(l => l.isCompleted).length ?? 0;
  const progressPercent = lessonCount > 0 ? Math.round((completedLessonCount / lessonCount) * 100) : 0;

  // Find missing items
  const missingItems = course.lessons?.flatMap(l => l.items.filter(i => i.isMissing)) ?? [];
  const hasMissingItems = missingItems.length > 0;

  // Find next incomplete item across all lessons
  const findNextItem = (): { lesson: Lesson; item: LessonItem } | null => {
    for (const lesson of course.lessons || []) {
      const nextItem = lesson.items.find(i => !i.isCompleted && !i.isMissing);
      if (nextItem) {
        return { lesson, item: nextItem };
      }
    }
    return null;
  };
  const nextItem = findNextItem();
  const continueTo = nextItem ? courseLaunchUrl(id!, nextItem.lesson.id, nextItem.item) : "";

  // Linear gating: a lesson is locked until every earlier lesson is complete —
  // unless the course has open navigation (all lessons unlocked).
  const lessons = course.lessons ?? [];
  const lessonLocked = lessons.map(
    (_, i) => !course.openNavigation && lessons.slice(0, i).some((l) => !l.isCompleted)
  );

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        <div className="fade-in">
          {/* Back link */}
          <BackButton
            fallbackPath="/courses"
            label="Back to Courses"
          />

          {/* Header */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-[#fcfcfa]">{course.name}</h1>
                  <FavoriteButton
                    isFavorite={course.isFavorite ?? false}
                    onClick={handleToggleFavorite}
                  />
                </div>
                {course.description && (
                  <p className="text-[#939293]">{course.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/courses/${id}/edit`}
                  className="px-3 py-2 bg-[#ffd866]/20 text-[#ffd866] text-sm rounded-lg hover:bg-[#ffd866]/30 transition-colors font-medium"
                >
                  Edit
                </Link>
                {showDeleteConfirm ? (
                  <div className="flex gap-1">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-3 py-2 bg-[#ff6188] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#ff6188]/90 transition-colors disabled:opacity-50"
                    >
                      {deleting ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-3 py-2 bg-[#5b595c] text-[#fcfcfa] text-sm rounded-lg hover:bg-[#5b595c]/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3 py-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded-lg transition-colors"
                    title="Delete course"
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

            {/* Progress */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#939293]">Progress</span>
                  <span className={progressPercent === 100 ? "text-[#a9dc76]" : "text-[#ab9df2]"}>
                    {completedLessonCount} / {lessonCount} lessons ({progressPercent}%)
                  </span>
                </div>
                <div className="h-2 bg-[#5b595c] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      progressPercent === 100 ? "bg-[#a9dc76]" : "bg-[#ab9df2]"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              {nextItem && (
                <Link
                  to={continueTo}
                  className="px-4 py-2 bg-[#a9dc76] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#a9dc76]/90 transition-colors font-medium whitespace-nowrap"
                >
                  Continue Learning
                </Link>
              )}
            </div>
          </div>

          {/* Missing Items Warning */}
          {hasMissingItems && (
            <div className="bg-[#ff6188]/10 border border-[#ff6188]/30 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#ff6188] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-[#ff6188] mb-1">Missing Items</h3>
                  <p className="text-sm text-[#939293] mb-2">
                    {missingItems.length} {missingItems.length === 1 ? "item is" : "items are"} not found. Import the missing decks/quizzes, then click "Link Items" to connect them.
                  </p>
                  <button
                    onClick={handleLinkItems}
                    disabled={linking}
                    className="text-sm px-3 py-1.5 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 transition-colors font-medium disabled:opacity-50"
                  >
                    {linking ? "Linking..." : "Link Items"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lessons */}
          {lessonCount === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-[#5b595c]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-[#fcfcfa]">No lessons in this course</h3>
              <p className="mt-1 text-sm text-[#939293]">
                Add lessons to build your learning path.
              </p>
              <Link
                to={`/courses/${id}/edit`}
                className="mt-4 inline-flex items-center px-4 py-2 bg-[#ffd866] text-[#2d2a2e] text-sm rounded-lg hover:bg-[#ffd866]/90 transition-colors font-medium"
              >
                Add Lessons
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {course.lessons?.map((lesson, lessonIndex) => (
                <LessonSection
                  key={lesson.id}
                  lesson={lesson}
                  lessonIndex={lessonIndex}
                  courseId={id!}
                  isLocked={lessonLocked[lessonIndex]}
                  isExpanded={expandedLessons.has(lesson.id)}
                  onToggle={() => toggleLesson(lesson.id)}
                  onToggleItemComplete={(item) => handleToggleItemComplete(lesson, item)}
                  onAdopt={handleAdopt}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

interface LessonSectionProps {
  lesson: Lesson;
  lessonIndex: number;
  courseId: string;
  isLocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onToggleItemComplete: (item: LessonItem) => void;
  onAdopt: (item: LessonItem) => void;
}

function LessonSection({ lesson, lessonIndex, courseId, isLocked, isExpanded, onToggle, onToggleItemComplete, onAdopt }: LessonSectionProps) {
  const itemCount = lesson.items.length;
  const completedItemCount = lesson.completedItemCount ?? 0;

  return (
    <div className="bg-[#403e41] rounded-xl border border-[#5b595c] overflow-hidden">
      {/* Lesson Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-[#5b595c]/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-mono text-[#939293]">{lessonIndex + 1}</span>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
            lesson.isCompleted
              ? "border-[#a9dc76] bg-[#a9dc76] text-[#2d2a2e]"
              : "border-[#5b595c]"
          }`}>
            {lesson.isCompleted && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-base font-medium text-[#fcfcfa]">{lesson.title}</h3>
          {lesson.description && (
            <p className="text-sm text-[#939293] line-clamp-1">{lesson.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[#5b595c]/50 text-[#939293]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Locked
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${
            lesson.isCompleted ? "bg-[#a9dc76]/20 text-[#a9dc76]" : "bg-[#ab9df2]/20 text-[#ab9df2]"
          }`}>
            {completedItemCount}/{itemCount}
          </span>
          <svg
            className={`w-5 h-5 text-[#939293] transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Lesson Items */}
      {isExpanded && (
        <div className="border-t border-[#5b595c]">
          {itemCount === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-[#939293]">
              No items in this lesson
            </div>
          ) : (
            <div className="divide-y divide-[#5b595c]/50">
              {lesson.items.map((item, itemIndex) => (
                <LessonItemCard
                  key={item.id}
                  item={item}
                  index={itemIndex}
                  courseId={courseId}
                  lessonId={lesson.id}
                  isLocked={isLocked}
                  onToggleComplete={() => onToggleItemComplete(item)}
                  onAdopt={() => onAdopt(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LessonItemCardProps {
  item: LessonItem;
  index: number;
  courseId: string;
  lessonId: string;
  isLocked: boolean;
  onToggleComplete: () => void;
  onAdopt: () => void;
}

function LessonItemCard({ item, index, courseId, lessonId, isLocked, onToggleComplete, onAdopt }: LessonItemCardProps) {
  const isDeck = item.itemType === "deck";
  const isMissing = item.isMissing ?? false;
  const typeLabel = isMissing ? "Missing" : isDeck ? "Deck" : item.itemType === "quiz" ? "Quiz" : "Note";
  const actionLabel = isDeck ? "Study" : item.itemType === "quiz" ? "Take" : "Read";
  // Launches in course context (records progress, returns to course).
  const studyPath = courseLaunchUrl(courseId, lessonId, item);

  // Format requirement text
  const getRequirementText = () => {
    if (!item.requirementType) return null;
    switch (item.requirementType) {
      case "study":
        return "Complete a study session";
      case "review":
        return "Review the deck";
      case "complete":
        return "Complete the quiz";
      case "min_score":
        return `Score at least ${item.requirementValue}%`;
      case "read":
        return "Read the note";
      default:
        return null;
    }
  };
  const requirementText = getRequirementText();

  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 ${
        isMissing
          ? "bg-[#ff6188]/5"
          : item.isCompleted
          ? "bg-[#a9dc76]/5"
          : ""
      }`}
    >
      {/* Order number and checkbox */}
      <div className="flex items-center gap-3 pl-8">
        <span className="text-sm font-mono text-[#939293] w-6 text-center">{index + 1}</span>
        {!isMissing && !isLocked && (
          <button
            onClick={onToggleComplete}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              item.isCompleted
                ? "border-[#a9dc76] bg-[#a9dc76] text-[#2d2a2e]"
                : "border-[#5b595c] hover:border-[#a9dc76]"
            }`}
          >
            {item.isCompleted && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}
        {!isMissing && isLocked && (
          <div className="w-5 h-5 rounded-full border-2 border-[#5b595c] flex items-center justify-center text-[#5b595c]">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )}
        {isMissing && (
          <div className="w-5 h-5 rounded-full border-2 border-[#ff6188] flex items-center justify-center">
            <span className="text-[#ff6188] text-xs">!</span>
          </div>
        )}
      </div>

      {/* Item info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              isMissing
                ? "bg-[#ff6188]/20 text-[#ff6188]"
                : isDeck
                ? "bg-[#78dce8]/20 text-[#78dce8]"
                : "bg-[#ab9df2]/20 text-[#ab9df2]"
            }`}
          >
            {typeLabel}
          </span>
          {item.isCompleted && (
            <span className="text-xs text-[#a9dc76]">Completed</span>
          )}
          {item.bestScore !== undefined && item.bestScore !== null && (
            <span className="text-xs text-[#939293]">Best: {item.bestScore}%</span>
          )}
        </div>
        <h4 className={`text-sm font-medium truncate ${
          isMissing
            ? "text-[#ff6188]"
            : item.isCompleted
            ? "text-[#939293]"
            : "text-[#fcfcfa]"
        }`}>
          {item.itemName}
        </h4>
        {requirementText && (
          <p className="text-xs text-[#939293] mt-0.5">{requirementText}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!isMissing && isLocked && (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#939293]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Locked
          </span>
        )}
        {!isMissing && !isLocked && (
          <>
            <button
              onClick={onAdopt}
              title="Save a personal, editable copy to your library"
              className="px-2 py-1 text-xs text-[#939293] hover:text-[#fcfcfa] hover:bg-[#5b595c] rounded transition-colors"
            >
              Save copy
            </button>
            <Link
              to={studyPath}
              className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                isDeck
                  ? "bg-[#a9dc76]/20 text-[#a9dc76] hover:bg-[#a9dc76]/30"
                  : "bg-[#ab9df2]/20 text-[#ab9df2] hover:bg-[#ab9df2]/30"
              }`}
            >
              {actionLabel}
            </Link>
          </>
        )}
        {isMissing && (
          <Link
            to={isDeck ? "/decks" : "/quizzes"}
            className="px-2 py-1 text-xs bg-[#ffd866]/20 text-[#ffd866] rounded hover:bg-[#ffd866]/30 transition-colors"
          >
            Import
          </Link>
        )}
      </div>
    </div>
  );
}
