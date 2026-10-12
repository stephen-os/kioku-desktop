import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import type { CourseItemOverview, LessonItemType } from "@/types";
import type { ViewMode } from "@/hooks";
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
  /** Match the page's grid/list view so the section doesn't clash. */
  view?: ViewMode;
}

/**
 * "From your courses" — surfaces unlocked, course-owned items of one type on a
 * library page. Items launch read-only in course context; locked content never
 * appears here. A "Due only" toggle narrows to items not yet completed.
 */
export function CourseItemsSection({ itemType, onAdopted, view = "grid" }: CourseItemsSectionProps) {
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

      {view === "list" ? (
        <div className="flex flex-col gap-2">
          {visible.map((item) => {
            const req = requirementLabel(item);
            return (
              <div
                key={item.lessonItemId}
                className="flex items-center gap-3 bg-[#403e41] rounded-lg border border-[#5b595c] hover:border-[#939293] transition-colors px-4 py-2.5"
              >
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <StatusBadge completed={item.completed} />
                  <span className="text-sm font-medium text-[#fcfcfa] truncate">{item.itemName}</span>
                  <span className="text-xs text-[#939293] truncate hidden md:block">
                    {item.courseName}
                    {req && <span className="text-[#fc9867]"> · {req}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <AdoptButton item={item} adopting={adoptingId === item.lessonItemId} onAdopt={handleAdopt} />
                  <Link
                    to={launchUrl(item)}
                    className="px-2 py-1 text-xs rounded bg-[#78dce8]/20 text-[#78dce8] hover:bg-[#78dce8]/30 transition-colors font-medium"
                  >
                    {ACTION_LABEL[item.itemType]}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const req = requirementLabel(item);
            return (
              <div
                key={item.lessonItemId}
                className="block bg-[#403e41] overflow-hidden rounded-xl border border-[#5b595c] hover:border-[#939293] transition-colors"
              >
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <StatusBadge completed={item.completed} />
                    <span className="text-xs text-[#939293] truncate max-w-[55%] text-right">{item.courseName}</span>
                  </div>
                  <h3 className="text-base font-medium text-[#fcfcfa] truncate">{item.itemName}</h3>
                  <p className="mt-1 text-sm text-[#939293] line-clamp-2">
                    {req ? <span className="text-[#fc9867]">{req}</span> : "From your courses"}
                  </p>
                </div>
                <div className="px-5 pb-4 flex gap-2">
                  <Link
                    to={launchUrl(item)}
                    className="flex-1 text-center px-3 py-2 bg-[#78dce8]/20 text-[#78dce8] text-sm rounded-lg hover:bg-[#78dce8]/30 transition-colors font-medium"
                  >
                    {ACTION_LABEL[item.itemType]}
                  </Link>
                  <AdoptButton item={item} adopting={adoptingId === item.lessonItemId} onAdopt={handleAdopt} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ completed }: { completed: boolean }) {
  return completed ? (
    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#a9dc76]/20 text-[#a9dc76] font-semibold shrink-0">
      Done
    </span>
  ) : (
    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#ffd866]/20 text-[#ffd866] font-semibold shrink-0">
      Due
    </span>
  );
}

function AdoptButton({
  item,
  adopting,
  onAdopt,
}: {
  item: CourseItemOverview;
  adopting: boolean;
  onAdopt: (item: CourseItemOverview) => void;
}) {
  return (
    <button
      onClick={() => onAdopt(item)}
      disabled={adopting}
      className="p-1.5 rounded-md text-[#c1c0c0] hover:text-[#fcfcfa] hover:bg-[#5b595c] transition-colors disabled:opacity-50 shrink-0"
      title="Save a personal, editable copy to your library"
      aria-label="Save a personal copy to your library"
    >
      {adopting ? (
        <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 16V4" />
        </svg>
      )}
    </button>
  );
}
