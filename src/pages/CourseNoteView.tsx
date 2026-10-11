import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Page } from "@/types";
import { getCoursePage, recordLessonProgress, courseUpdatePage } from "@/lib/db";
import { NotesBlockEditor } from "@/components/notes/BlockNoteEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";

// Reader/editor for a course-owned note. Reading it from a lesson marks the item
// read (Q5: notes complete on view) and returns to the course. Launched with
// `?edit=1` from the course editor, it becomes an editable authoring surface.
export function CourseNoteView() {
  const { coursePageId } = useParams<{ coursePageId: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);

  const courseId = searchParams.get("courseId") || "";
  const lessonId = searchParams.get("lessonId") || "";
  const lessonItemId = searchParams.get("lessonItemId") || "";
  const isEdit = searchParams.get("edit") === "1";

  // Edit-mode working state
  const [title, setTitle] = useState("");
  const contentRef = useRef("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!coursePageId) return;
      try {
        const data = await getCoursePage(coursePageId);
        if (!cancelled) {
          setPage(data);
          setTitle(data.title);
          contentRef.current = data.content;
        }
      } catch (error) {
        console.error("Failed to load note:", error);
        if (!cancelled) toast.error("Failed to load note");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [coursePageId, toast]);

  // Opening the note from a course marks it read (fires once; not in edit mode).
  const recordedRef = useRef(false);
  useEffect(() => {
    if (isEdit || !courseId || !lessonId || !lessonItemId || recordedRef.current) return;
    recordedRef.current = true;
    recordLessonProgress(courseId, lessonId, lessonItemId).catch((err) =>
      console.error("Failed to record course progress:", err)
    );
  }, [isEdit, courseId, lessonId, lessonItemId]);

  const handleSave = useCallback(async () => {
    if (!coursePageId) return;
    setSaving(true);
    try {
      await courseUpdatePage(coursePageId, {
        title: title.trim() || "Untitled",
        content: contentRef.current,
      });
      toast.success("Note saved");
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }, [coursePageId, title, toast]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">📄</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">Note not found</h1>
        <BackButton
          fallbackPath={courseId ? `/courses/${courseId}` : "/courses"}
          label="Back to Course"
        />
      </div>
    );
  }

  const backPath = isEdit && courseId ? `/courses/${courseId}/edit` : courseId ? `/courses/${courseId}` : "/courses";

  return (
    <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
      <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <BackButton fallbackPath={backPath} label="Back to Course" />
          {isEdit ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className="flex-1 min-w-0 px-3 py-1.5 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] font-mono focus:outline-none focus:border-[#ffd866]"
            />
          ) : (
            <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
              {page.title}
            </h1>
          )}
          {isEdit ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg font-medium hover:bg-[#ffd866]/90 disabled:opacity-50 transition-colors shrink-0"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          ) : (
            <span className="text-xs text-[#a9dc76]">Read ✓</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <NotesBlockEditor
            initialContent={page.content}
            onChange={(c) => {
              contentRef.current = c;
            }}
            onSave={isEdit ? handleSave : undefined}
            editable={isEdit}
          />
        </div>
      </div>
    </div>
  );
}
