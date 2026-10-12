/**
 * Converts a string to a URL/filename-safe slug.
 *
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Collapses multiple hyphens to one
 * - Trims leading/trailing hyphens
 *
 * @example
 * toSlug("What is 5*3?") // "what-is-5-3"
 * toSlug("My  Deck!") // "my-deck"
 * toSlug("  Hello World  ") // "hello-world"
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/-+/g, "-")          // Collapse multiple hyphens
    .replace(/^-|-$/g, "");       // Trim leading/trailing hyphens
}

/**
 * Generates a filename for deck export.
 * @example
 * getDeckFilename("My Deck") // "my-deck.json"
 */
export function getDeckFilename(name: string): string {
  const slug = toSlug(name);
  return `${slug || "deck"}.json`;
}

/**
 * Generates a filename for quiz export.
 * @example
 * getQuizFilename("My Quiz") // "my-quiz.json"
 */
export function getQuizFilename(name: string): string {
  const slug = toSlug(name);
  return `${slug || "quiz"}.json`;
}

/**
 * Generates a filename for course export.
 * @example
 * getCourseFilename("My Course") // "my-course.json"
 */
export function getCourseFilename(name: string): string {
  const slug = toSlug(name);
  return `${slug || "course"}.json`;
}

/**
 * Generates a filename for bulk export ZIP.
 * @example
 * getBulkExportFilename() // "kioku-export-2026-02-22.zip"
 */
export function getBulkExportFilename(): string {
  const date = new Date().toISOString().split("T")[0];
  return `kioku-export-${date}.zip`;
}
