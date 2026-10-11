import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { Page } from "@/types";
import { getCoursePage, recordLessonProgress } from "@/lib/db";
import { NotesBlockEditor } from "@/components/notes/BlockNoteEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";

// Read-only reader for a course-owned note. Opening it marks the lesson item
// read (Q5: notes complete on view) and returns the user to the course.
export function CourseNoteView() {
  const { coursePageId } = useParams<{ coursePageId: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);

  const courseId = searchParams.get("courseId") || "";
  const lessonId = searchParams.get("lessonId") || "";
  const lessonItemId = searchParams.get("lessonItemId") || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!coursePageId) return;
      try {
        const data = await getCoursePage(coursePageId);
        if (!cancelled) setPage(data);
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

  // Opening the note from a course marks it read (fires once).
  const recordedRef = useRef(false);
  useEffect(() => {
    if (!courseId || !lessonId || !lessonItemId || recordedRef.current) return;
    recordedRef.current = true;
    recordLessonProgress(courseId, lessonId, lessonItemId).catch((err) =>
      console.error("Failed to record course progress:", err)
    );
  }, [courseId, lessonId, lessonItemId]);

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

  return (
    <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
      <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <BackButton
            fallbackPath={courseId ? `/courses/${courseId}` : "/courses"}
            label="Back to Course"
          />
          <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
            {page.title}
          </h1>
          <span className="text-xs text-[#a9dc76]">Read ✓</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <NotesBlockEditor initialContent={page.content} onChange={() => {}} editable={false} />
        </div>
      </div>
    </div>
  );
}
