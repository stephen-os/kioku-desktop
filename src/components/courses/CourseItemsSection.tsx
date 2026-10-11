import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { CourseItemOverview, LessonItemType } from "@/types";
import {
  getCourseItemsOverview,
  adoptCourseDeck,
  adoptCourseQuiz,
  adoptCoursePage,
} from "@/lib/db";
import { useToast } from "@/context/ToastContext";

// Build a launch URL that carries course context so the session records
// progress and returns to the course (mirrors CourseView's launcher).
function launchUrl(item: CourseItemOverview): string {
  const base =
    item.itemType === "deck"
      ? `/decks/${item.itemId}/study`
      : item.itemType === "quiz"
      ? `/quizzes/${item.itemId}/take`
      : `/course-note/${item.itemId}`;
  const ctx = new URLSearchParams({
    courseId: item.courseId,
    lessonId: item.lessonId,
    lessonItemId: item.lessonItemId,
    source: "course",
  });
  if (item.requirementType === "min_score" && item.requirementValue != null) {
    ctx.set("minScore", String(item.requirementValue));
  }
  return `${base}?${ctx.toString()}`;
}

const ACTION_LABEL: Record<LessonItemType, string> = {
  deck: "Study",
  quiz: "Take",
  note: "Read",
};

function requirementLabel(item: CourseItemOverview): string | null {
  if (item.itemType === "quiz" && item.requirementType === "min_score") {
    return `Pass ≥ ${item.requirementValue ?? 0}%`;
  }
  return null;
}

interface CourseItemsSectionProps {
  itemType: LessonItemType;
  /** Called after an item is adopted into the library, to refresh it. */
  onAdopted?: () => void;
}

/**
 * "From your courses" — surfaces unlocked, course-owned items of one type on a
 * library page. Items launch read-only in course context; locked content never
 * appears here. A "Due only" toggle narrows to items not yet completed.
 */
export function CourseItemsSection({ itemType, onAdopted }: CourseItemsSectionProps) {
  const [items, setItems] = useState<CourseItemOverview[]>([]);
  const [dueOnly, setDueOnly] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (): Promise<void> => {
    try {
      const all = await getCourseItemsOverview();
      setItems(all.filter((i) => i.itemType === itemType && !i.locked));
    } catch (error) {
      console.error("Failed to load course items:", error);
    }
  }, [itemType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdopt = async (item: CourseItemOverview): Promise<void> => {
    setAdoptingId(item.lessonItemId);
    try {
      if (item.itemType === "deck") await adoptCourseDeck(item.itemId);
      else if (item.itemType === "quiz") await adoptCourseQuiz(item.itemId);
      else await adoptCoursePage(item.itemId);
      toast.success(`Saved a personal copy of "${item.itemName}"`);
      onAdopted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save copy");
    } finally {
      setAdoptingId(null);
    }
  };

  if (items.length === 0) {
    return null;
  }

  const visible = dueOnly ? items.filter((i) => !i.completed) : items;
  const dueCount = items.filter((i) => !i.completed).length;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[#939293] flex items-center gap-2">
          <svg className="w-4 h-4 text-[#ab9df2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          From your courses
        </h3>
        {dueCount > 0 && (
          <button
            onClick={() => setDueOnly((v) => !v)}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              dueOnly
                ? "bg-[#ffd866] text-[#2d2a2e]"
                : "bg-[#403e41] text-[#c1c0c0] hover:bg-[#5b595c]"
            }`}
          >
            Due{dueOnly ? "" : ` (${dueCount})`}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-[#403e41] divide-y divide-[#403e41] overflow-hidden">
        {visible.map((item) => {
          const req = requirementLabel(item);
          return (
            <div
              key={item.lessonItemId}
              className="flex items-center gap-3 px-4 py-3 bg-[#2d2a2e] hover:bg-[#333034] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#fcfcfa] truncate">
                    {item.itemName}
                  </span>
                  {!item.completed && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#ffd866]/20 text-[#ffd866] font-semibold shrink-0">
                      Due
                    </span>
                  )}
                  {item.completed && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#a9dc76]/20 text-[#a9dc76] font-semibold shrink-0">
                      Done
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#939293] truncate">
                  {item.courseName}
                  {req && <span className="text-[#fc9867]"> · {req}</span>}
                </div>
              </div>
              <button
                onClick={() => handleAdopt(item)}
                disabled={adoptingId === item.lessonItemId}
                className="text-xs px-2.5 py-1.5 rounded-md text-[#c1c0c0] hover:text-[#fcfcfa] hover:bg-[#5b595c] transition-colors disabled:opacity-50 shrink-0"
                title="Save a personal, editable copy to your library"
              >
                {adoptingId === item.lessonItemId ? "Saving…" : "Save copy"}
              </button>
              <Link
                to={launchUrl(item)}
                className="text-xs px-3 py-1.5 rounded-md font-medium text-[#2d2a2e] bg-[#78dce8] hover:bg-[#78dce8]/90 transition-colors shrink-0"
              >
                {ACTION_LABEL[item.itemType]}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
