import { invoke } from "@tauri-apps/api/core";
import type {
  Deck,
  Card,
  Tag,
  CreateDeckRequest,
  UpdateDeckRequest,
  CreateCardRequest,
  UpdateCardRequest,
  // Quiz types
  Quiz,
  Question,
  QuizAttempt,
  QuestionAnswer,
  QuizStats,
  CreateQuizRequest,
  UpdateQuizRequest,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CreateChoiceRequest,
  SubmitQuizRequest,
  // Study session types
  StudySession,
  DeckStudyStats,
  // Local user types
  LocalUser,
  CreateUserRequest,
  // Course types
  Course,
  Lesson,
  LessonItem,
  LessonProgress,
  CreateCourseRequest,
  UpdateCourseRequest,
  CreateLessonRequest,
  UpdateLessonRequest,
  AddLessonItemRequest,
  ReorderLessonsRequest,
  ReorderLessonItemsRequest,
  LinkItemsResult,
  CourseImportResult,
  CourseItemOverview,
  // Notebook types
  Notebook,
  Page,
  PageSearchResult,
  CreateNotebookRequest,
  UpdateNotebookRequest,
  CreatePageRequest,
  UpdatePageRequest,
  ReorderPagesRequest,
} from "@/types";

// ============================================
// Local User Operations
// ============================================

export async function getAllUsers(): Promise<LocalUser[]> {
  return invoke<LocalUser[]>("get_all_users");
}

export async function getUser(userId: string): Promise<LocalUser> {
  return invoke<LocalUser>("get_user", { userId });
}

export async function createUser(request: CreateUserRequest): Promise<LocalUser> {
  return invoke<LocalUser>("create_user", { request });
}

export async function loginUser(userId: string, password?: string): Promise<LocalUser> {
  return invoke<LocalUser>("login_user", { userId, password });
}

export async function getActiveUser(): Promise<LocalUser | null> {
  return invoke<LocalUser | null>("get_active_user");
}

export async function logoutUser(): Promise<void> {
  return invoke("logout_user");
}

export async function deleteUser(userId: string): Promise<void> {
  return invoke("delete_user", { userId });
}

export async function updateUser(userId: string, name: string, password?: string, avatar?: string): Promise<LocalUser> {
  return invoke<LocalUser>("update_user", { userId, name, password, avatar });
}

export async function removeUserPassword(userId: string): Promise<LocalUser> {
  return invoke<LocalUser>("remove_user_password", { userId });
}

// ============================================
// Deck Operations
// ============================================

export async function getAllDecks(): Promise<Deck[]> {
  return invoke<Deck[]>("get_all_decks");
}

// Distinct spoken languages used across the user's cards — for background TTS warm-up.
export async function getUsedTtsLangs(): Promise<string[]> {
  return invoke<string[]>("get_used_tts_langs");
}

export async function getDeck(id: string): Promise<Deck | null> {
  return invoke<Deck | null>("get_deck", { id });
}

export async function createDeck(request: CreateDeckRequest): Promise<Deck> {
  return invoke<Deck>("create_deck", { request });
}

export async function updateDeck(
  id: string,
  request: CreateDeckRequest
): Promise<Deck> {
  return invoke<Deck>("update_deck", { id, request });
}

export async function deleteDeck(id: string): Promise<void> {
  return invoke("delete_deck", { id });
}

// ============================================
// Card Operations
// ============================================

// Card tag type from API
interface CardTagResponse {
  id: string;
  name: string;
}

// Card response type from API
interface CardResponse {
  id: string;
  deckId: string;
  front: string;
  frontType: string;
  frontLanguage: string | null;
  back: string;
  backType: string;
  backLanguage: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tags: CardTagResponse[];
}

export async function getCardsForDeck(deckId: string): Promise<Card[]> {
  const cards = await invoke<CardResponse[]>("get_cards_for_deck", {
    deckId,
  });

  // Transform card tags to full Tag format
  return cards.map((card) => ({
    ...card,
    tags: card.tags.map((t) => ({
      id: t.id,
      deckId: deckId,
      name: t.name,
    })),
  })) as Card[];
}

export async function getCard(id: string, deckId?: string): Promise<Card | null> {
  const card = await invoke<CardResponse | null>("get_card", { id });
  if (!card) return null;

  return {
    ...card,
    tags: card.tags.map((t) => ({
      id: t.id,
      deckId: deckId || card.deckId,
      name: t.name,
    })),
  } as Card;
}

export async function createCard(
  deckId: string,
  request: CreateCardRequest
): Promise<Card> {
  const card = await invoke<CardResponse>("create_card", {
    deckId,
    request,
  });
  return {
    ...card,
    tags: card.tags?.map((t) => ({
      id: t.id,
      deckId: deckId,
      name: t.name,
    })) || [],
  } as Card;
}

export async function updateCard(
  id: string,
  deckId: string,
  request: UpdateCardRequest
): Promise<Card> {
  const card = await invoke<CardResponse>("update_card", {
    id,
    deckId,
    request,
  });
  return {
    ...card,
    tags: card.tags?.map((t) => ({
      id: t.id,
      deckId: deckId,
      name: t.name,
    })) || [],
  } as Card;
}

export async function deleteCard(id: string, deckId: string): Promise<void> {
  return invoke("delete_card", { id, deckId });
}

// ============================================
// Tag Operations
// ============================================

export async function getTagsForDeck(deckId: string): Promise<Tag[]> {
  return invoke<Tag[]>("get_tags_for_deck", { deckId });
}

export async function createTag(deckId: string, name: string): Promise<Tag> {
  return invoke<Tag>("create_tag", { deckId, name });
}

export async function deleteTag(deckId: string, id: string): Promise<void> {
  return invoke("delete_tag", { deckId, id });
}

export async function addTagToCard(
  deckId: string,
  cardId: string,
  tagId: string
): Promise<void> {
  return invoke("add_tag_to_card", { deckId, cardId, tagId });
}

export async function removeTagFromCard(
  deckId: string,
  cardId: string,
  tagId: string
): Promise<void> {
  return invoke("remove_tag_from_card", { deckId, cardId, tagId });
}

// ============================================
// Deck Favorite Operations
// ============================================

export async function toggleDeckFavorite(deckId: string): Promise<boolean> {
  return invoke<boolean>("toggle_deck_favorite", { deckId });
}

// ============================================
// Course Operations
// ============================================

export async function getAllCourses(): Promise<Course[]> {
  return invoke<Course[]>("get_all_courses");
}

export async function getCourse(id: string): Promise<Course | null> {
  return invoke<Course | null>("get_course", { id });
}

export async function getCourseWithLessons(id: string): Promise<Course | null> {
  return invoke<Course | null>("get_course_with_lessons", { id });
}

export async function createCourse(request: CreateCourseRequest): Promise<Course> {
  return invoke<Course>("create_course", { request });
}

export async function updateCourse(id: string, request: UpdateCourseRequest): Promise<Course> {
  return invoke<Course>("update_course", { id, request });
}

export async function deleteCourse(id: string): Promise<void> {
  return invoke("delete_course", { id });
}

export async function toggleCourseFavorite(courseId: string): Promise<boolean> {
  return invoke<boolean>("toggle_course_favorite", { courseId });
}

// ============================================
// Lesson Operations
// ============================================

export async function getLessons(courseId: string): Promise<Lesson[]> {
  return invoke<Lesson[]>("get_lessons", { courseId });
}

export async function getLesson(lessonId: string): Promise<Lesson | null> {
  return invoke<Lesson | null>("get_lesson", { lessonId });
}

export async function createLesson(courseId: string, request: CreateLessonRequest): Promise<Lesson> {
  return invoke<Lesson>("create_lesson", { courseId, request });
}

export async function updateLesson(lessonId: string, request: UpdateLessonRequest): Promise<void> {
  return invoke("update_lesson", { lessonId, request });
}

export async function deleteLesson(lessonId: string): Promise<void> {
  return invoke("delete_lesson", { lessonId });
}

export async function reorderLessons(courseId: string, request: ReorderLessonsRequest): Promise<void> {
  return invoke("reorder_lessons", { courseId, request });
}

// ============================================
// Lesson Item Operations
// ============================================

export async function getLessonItems(lessonId: string): Promise<LessonItem[]> {
  return invoke<LessonItem[]>("get_lesson_items", { lessonId });
}

export async function addLessonItem(lessonId: string, request: AddLessonItemRequest): Promise<LessonItem> {
  return invoke<LessonItem>("add_lesson_item", { lessonId, request });
}

export async function removeLessonItem(lessonItemId: string): Promise<void> {
  return invoke("remove_lesson_item", { lessonItemId });
}

export async function reorderLessonItems(lessonId: string, request: ReorderLessonItemsRequest): Promise<void> {
  return invoke("reorder_lesson_items", { lessonId, request });
}

export async function updateLessonItemReference(lessonItemId: string, itemId: string): Promise<void> {
  return invoke("update_lesson_item_reference", { lessonItemId, itemId });
}

// ============================================
// Lesson Progress Operations
// ============================================

export async function recordLessonProgress(
  courseId: string,
  lessonId: string,
  lessonItemId: string,
  scorePercentage?: number,
  attemptId?: string,
  sessionId?: string
): Promise<LessonProgress> {
  return invoke<LessonProgress>("record_lesson_progress", {
    courseId,
    lessonId,
    lessonItemId,
    scorePercentage,
    attemptId,
    sessionId,
  });
}

export async function clearLessonItemProgress(lessonItemId: string): Promise<void> {
  return invoke("clear_lesson_item_progress", { lessonItemId });
}

export async function getLessonProgress(courseId: string): Promise<LessonProgress[]> {
  return invoke<LessonProgress[]>("get_lesson_progress", { courseId });
}

export async function resetCourseProgress(courseId: string): Promise<void> {
  return invoke("reset_course_progress", { courseId });
}

// Course-owned content (studied/taken/read with the shared engines)
export async function getCourseDeck(courseDeckId: string): Promise<Deck> {
  return invoke<Deck>("get_course_deck", { courseDeckId });
}

export async function getCourseCards(courseDeckId: string): Promise<Card[]> {
  return invoke<Card[]>("get_course_cards", { courseDeckId });
}

export async function getCourseQuiz(courseQuizId: string): Promise<Quiz> {
  return invoke<Quiz>("get_course_quiz", { courseQuizId });
}

export async function getCoursePage(coursePageId: string): Promise<Page> {
  return invoke<Page>("get_course_page", { coursePageId });
}

// Authoring: create a lesson item backed by course-owned content (copied from
// the library or blank-authored).
export async function courseAddItem(args: {
  lessonId: string;
  itemType: "deck" | "quiz" | "note";
  mode: "library" | "blank";
  sourceId?: string;
  name: string;
  requirementType?: string;
  requirementValue?: number;
}): Promise<LessonItem> {
  return invoke<LessonItem>("course_add_item", args);
}

// Adopt: copy course-owned content into the personal library.
export async function adoptCourseDeck(courseDeckId: string): Promise<string> {
  return invoke<string>("adopt_course_deck", { courseDeckId });
}

export async function adoptCourseQuiz(courseQuizId: string): Promise<string> {
  return invoke<string>("adopt_course_quiz", { courseQuizId });
}

export async function adoptCoursePage(coursePageId: string): Promise<string> {
  return invoke<string>("adopt_course_page", { coursePageId });
}

// Grade a course quiz (not persisted); returns a QuizAttempt-shaped result.
export async function gradeCourseQuiz(
  courseQuizId: string,
  answers: QuestionAnswer[]
): Promise<QuizAttempt> {
  return invoke<QuizAttempt>("grade_course_quiz", { courseQuizId, answers });
}

export async function linkCourseItems(courseId: string): Promise<LinkItemsResult> {
  return invoke<LinkItemsResult>("link_course_items", { courseId });
}

// Every course-owned item flattened with lesson context, completion, and lock
// state — powers the "From your courses" library sections and the due filter.
export async function getCourseItemsOverview(): Promise<CourseItemOverview[]> {
  return invoke<CourseItemOverview[]>("get_course_items_overview");
}

// Course-owned content editing (Edit-course mode) — mirrors the library CRUD
// against the course_* tables so DeckEdit/QuizEditor/CourseNoteView can reuse
// their forms on a course's owned copy.
export async function courseUpdateDeck(id: string, request: UpdateDeckRequest): Promise<Deck> {
  return invoke<Deck>("course_update_deck", { id, request });
}

export async function courseCreateCard(courseDeckId: string, request: CreateCardRequest): Promise<Card> {
  return invoke<Card>("course_create_card", { courseDeckId, request });
}

export async function courseUpdateCard(id: string, request: UpdateCardRequest): Promise<Card> {
  return invoke<Card>("course_update_card", { id, request });
}

export async function courseDeleteCard(id: string): Promise<void> {
  return invoke("course_delete_card", { id });
}

export async function courseUpdateQuiz(id: string, request: UpdateQuizRequest): Promise<Quiz> {
  return invoke<Quiz>("course_update_quiz", { id, request });
}

export async function courseCreateQuestion(courseQuizId: string, request: CreateQuestionRequest): Promise<Question> {
  return invoke<Question>("course_create_question", { courseQuizId, request });
}

export async function courseUpdateQuestion(id: string, request: UpdateQuestionRequest): Promise<Question> {
  return invoke<Question>("course_update_question", { id, request });
}

export async function courseDeleteQuestion(id: string): Promise<void> {
  return invoke("course_delete_question", { id });
}

export async function courseUpdateQuestionChoices(courseQuestionId: string, choices: CreateChoiceRequest[]): Promise<void> {
  return invoke("course_update_question_choices", { courseQuestionId, choices });
}

export async function courseReorderQuestions(courseQuizId: string, questionIds: string[]): Promise<void> {
  return invoke("course_reorder_questions", { courseQuizId, questionIds });
}

export async function courseUpdatePage(id: string, request: UpdatePageRequest): Promise<Page> {
  return invoke<Page>("course_update_page", { id, request });
}

// ============================================
// Quiz Tag Operations
// ============================================

export interface QuizTag {
  id: string;
  quizId: string;
  name: string;
}

export interface QuestionTag {
  id: string;
  name: string;
}

export async function getTagsForQuiz(quizId: string): Promise<QuizTag[]> {
  return invoke<QuizTag[]>("get_tags_for_quiz", { quizId });
}

export async function getTagsForQuestion(questionId: string): Promise<QuestionTag[]> {
  return invoke<QuestionTag[]>("get_tags_for_question", { questionId });
}

export async function createQuizTag(quizId: string, name: string): Promise<QuizTag> {
  return invoke<QuizTag>("create_quiz_tag", { quizId, name });
}

export async function deleteQuizTag(quizId: string, tagId: string): Promise<void> {
  return invoke("delete_quiz_tag", { quizId, tagId });
}

export async function addTagToQuestion(
  questionId: string,
  tagId: string
): Promise<void> {
  return invoke("add_tag_to_question", { questionId, tagId });
}

export async function removeTagFromQuestion(
  questionId: string,
  tagId: string
): Promise<void> {
  return invoke("remove_tag_from_question", { questionId, tagId });
}

// ============================================
// Import/Export Operations
// ============================================

export interface ImportResult {
  deck: Deck;
  cardsImported: number;
}

export interface DeckExport {
  name: string;
  description: string | null;
  cards: CardExport[];
  exportedAt: string;
}

export interface CardExport {
  front: string;
  back: string;
  frontType: string;
  backType: string;
  frontLanguage: string | null;
  backLanguage: string | null;
  notes: string | null;
}

export async function importDeck(filePath: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_deck_from_file", { filePath });
}

export async function exportDeck(deckId: string): Promise<string> {
  return invoke<string>("export_deck_to_json", { deckId });
}


// ============================================
// Quiz Import
// ============================================

export interface QuizImportResult {
  quiz: Quiz;
  questionsImported: number;
}

export async function importQuiz(filePath: string): Promise<QuizImportResult> {
  return invoke<QuizImportResult>("import_quiz_from_file", { filePath });
}

export async function exportQuiz(quizId: string): Promise<string> {
  return invoke<string>("export_quiz_to_json", { quizId });
}

// ============================================
// Course Import / Export
// ============================================

export async function importCourse(filePath: string): Promise<CourseImportResult> {
  return invoke<CourseImportResult>("import_course_from_file", { filePath });
}

export async function exportCourse(courseId: string): Promise<string> {
  return invoke<string>("export_course_to_json", { courseId });
}

// ============================================
// Quiz Operations
// ============================================

export async function getAllQuizzes(): Promise<Quiz[]> {
  return invoke<Quiz[]>("get_all_quizzes");
}

export async function getQuiz(quizId: string): Promise<Quiz> {
  return invoke<Quiz>("get_quiz", { quizId });
}

export async function createQuiz(request: CreateQuizRequest): Promise<Quiz> {
  return invoke<Quiz>("create_quiz", { request });
}

export async function updateQuiz(
  quizId: string,
  request: UpdateQuizRequest
): Promise<Quiz> {
  return invoke<Quiz>("update_quiz", { quizId, request });
}

export async function deleteQuiz(quizId: string): Promise<void> {
  return invoke("delete_quiz", { quizId });
}

// ============================================
// Question Operations
// ============================================

export async function getQuestionsForQuiz(quizId: string): Promise<Question[]> {
  return invoke<Question[]>("get_questions_for_quiz", { quizId });
}

export async function getQuestion(questionId: string): Promise<Question> {
  return invoke<Question>("get_question", { questionId });
}

export async function createQuestion(
  quizId: string,
  request: CreateQuestionRequest
): Promise<Question> {
  return invoke<Question>("create_question", { quizId, request });
}

export async function updateQuestion(
  questionId: string,
  request: UpdateQuestionRequest
): Promise<Question> {
  return invoke<Question>("update_question", { questionId, request });
}

export async function deleteQuestion(questionId: string): Promise<void> {
  return invoke("delete_question", { questionId });
}

export async function reorderQuestions(
  quizId: string,
  questionIds: string[]
): Promise<void> {
  return invoke("reorder_questions", { quizId, questionIds });
}

export async function updateQuestionChoices(
  questionId: string,
  choices: CreateChoiceRequest[]
): Promise<void> {
  return invoke("update_question_choices", { questionId, choices });
}

// ============================================
// Quiz Attempt Operations
// ============================================

export async function startQuizAttempt(quizId: string): Promise<QuizAttempt> {
  return invoke<QuizAttempt>("start_quiz_attempt", { quizId });
}

export async function submitQuizAttempt(
  attemptId: string,
  request: SubmitQuizRequest
): Promise<QuizAttempt> {
  return invoke<QuizAttempt>("submit_quiz_attempt", { attemptId, request });
}

export async function getQuizAttempt(attemptId: string): Promise<QuizAttempt> {
  return invoke<QuizAttempt>("get_quiz_attempt", { attemptId });
}

export async function getQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  return invoke<QuizAttempt[]>("get_quiz_attempts", { quizId });
}

export async function getQuizStats(quizId: string): Promise<QuizStats> {
  return invoke<QuizStats>("get_quiz_stats", { quizId });
}

// ============================================
// Quiz Favorite Operations
// ============================================

export async function toggleQuizFavorite(quizId: string): Promise<boolean> {
  return invoke<boolean>("toggle_quiz_favorite", { quizId });
}

// ============================================
// Study Session Operations
// ============================================

export async function startStudySession(deckId: string): Promise<StudySession> {
  return invoke<StudySession>("start_study_session", { deckId });
}

export async function endStudySession(
  sessionId: string,
  cardsStudied: number
): Promise<StudySession> {
  return invoke<StudySession>("end_study_session", { sessionId, cardsStudied });
}

export async function getDeckStudyStats(deckId: string): Promise<DeckStudyStats> {
  return invoke<DeckStudyStats>("get_deck_study_stats", { deckId });
}

// ============================================
// Notebook Operations
// ============================================

export async function getAllNotebooks(): Promise<Notebook[]> {
  return invoke<Notebook[]>("get_all_notebooks");
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  return invoke<Notebook | null>("get_notebook", { id });
}

export async function createNotebook(request: CreateNotebookRequest): Promise<Notebook> {
  return invoke<Notebook>("create_notebook", { request });
}

export async function updateNotebook(id: string, request: UpdateNotebookRequest): Promise<Notebook> {
  return invoke<Notebook>("update_notebook", { id, request });
}

export async function deleteNotebook(id: string): Promise<void> {
  return invoke("delete_notebook", { id });
}

export async function toggleNotebookFavorite(notebookId: string): Promise<boolean> {
  return invoke<boolean>("toggle_notebook_favorite", { notebookId });
}

// ============================================
// Page Operations
// ============================================

export async function getPagesForNotebook(notebookId: string): Promise<Page[]> {
  return invoke<Page[]>("get_pages_for_notebook", { notebookId });
}

export async function getPage(id: string): Promise<Page | null> {
  return invoke<Page | null>("get_page", { id });
}

export async function createPage(notebookId: string, request: CreatePageRequest): Promise<Page> {
  return invoke<Page>("create_page", { notebookId, request });
}

export async function updatePage(id: string, request: UpdatePageRequest): Promise<Page> {
  return invoke<Page>("update_page", { id, request });
}

export async function deletePage(id: string): Promise<void> {
  return invoke("delete_page", { id });
}

export async function reorderPages(notebookId: string, request: ReorderPagesRequest): Promise<void> {
  return invoke("reorder_pages", { notebookId, request });
}

export async function togglePagePin(id: string): Promise<boolean> {
  return invoke<boolean>("toggle_page_pin", { id });
}

// ============================================
// Page Search Operations
// ============================================

export async function searchPages(
  query: string,
  limit?: number
): Promise<PageSearchResult[]> {
  return invoke<PageSearchResult[]>("search_pages", { query, limit });
}

export async function getRecentPages(
  limit?: number
): Promise<PageSearchResult[]> {
  return invoke<PageSearchResult[]>("get_recent_pages", { limit });
}

// ============================================
// Page Organization Operations
// ============================================

export async function duplicatePage(pageId: string): Promise<Page> {
  return invoke<Page>("duplicate_page", { pageId });
}

export async function movePage(
  pageId: string,
  targetNotebookId: string
): Promise<Page> {
  return invoke<Page>("move_page", { pageId, targetNotebookId });
}

// ============================================
// Backlinks Operations
// ============================================

export async function getBacklinks(pageId: string): Promise<PageSearchResult[]> {
  return invoke<PageSearchResult[]>("get_backlinks", { pageId });
}

export async function getAllPageTitles(): Promise<PageSearchResult[]> {
  return invoke<PageSearchResult[]>("get_all_page_titles");
}

// ============================================
// Image Operations
// ============================================

export async function saveImage(base64Data: string, extension: string): Promise<string> {
  return invoke<string>("save_image", { base64Data, extension });
}

export async function getImagePath(filename: string): Promise<string> {
  return invoke<string>("get_image_path", { filename });
}

export async function deleteImage(filename: string): Promise<void> {
  return invoke("delete_image", { filename });
}

export async function listImages(): Promise<string[]> {
  return invoke<string[]>("list_images");
}

export async function getImagesDirUrl(): Promise<string> {
  return invoke<string>("get_images_dir_url");
}
