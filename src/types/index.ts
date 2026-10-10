// ============================================
// Local User Types
// ============================================

export interface LocalUser {
  id: string;
  name: string;
  hasPassword: boolean;
  avatar: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateUserRequest {
  name: string;
  password?: string;
  avatar?: string;
}

export const AVATARS = [
  'avatar-smile',
  'avatar-cat',
  'avatar-robot',
  'avatar-star',
  'avatar-gem',
  'avatar-rocket',
] as const;

export type AvatarId = typeof AVATARS[number];

// ============================================
// Core Domain Types
// ============================================

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  shuffleCards: boolean;
  createdAt: string;
  updatedAt: string;
  cardCount?: number;
  isFavorite?: boolean;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  frontType: ContentType;
  frontLanguage: CodeLanguage | null;
  back: string;
  backType: ContentType;
  backLanguage: CodeLanguage | null;
  notes: string | null;
  ttsLang: TtsLang | null;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

// Spoken languages supported by the MeloTTS engine for read-aloud (text cards).
export type TtsLang = "en" | "es" | "fr" | "zh" | "ja" | "ko";

export const TTS_LANGUAGES: { code: TtsLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
];

export interface Tag {
  id: string;
  deckId: string;
  name: string;
}

// ============================================
// Content Types for Cards
// ============================================

export type ContentType = "TEXT" | "CODE";

export type CodeLanguage =
  // Plain text
  | "PLAINTEXT"
  // Web
  | "JAVASCRIPT"
  | "TYPESCRIPT"
  | "HTML"
  | "CSS"
  // Systems
  | "C"
  | "CPP"
  | "RUST"
  | "GO"
  // JVM
  | "JAVA"
  | "KOTLIN"
  | "SCALA"
  // Scripting
  | "PYTHON"
  | "RUBY"
  | "PHP"
  | "PERL"
  // Mobile
  | "SWIFT"
  | "DART"
  // .NET
  | "CSHARP"
  | "FSHARP"
  // Functional
  | "HASKELL"
  | "ELIXIR"
  | "CLOJURE"
  // Data & Query
  | "SQL"
  | "GRAPHQL"
  | "R"
  // Config & Data Formats
  | "JSON"
  | "YAML"
  | "XML"
  | "TOML"
  | "MARKDOWN"
  // Shell
  | "BASH"
  | "POWERSHELL"
  // Other
  | "DOCKER"
  | "REGEX";

// Language display labels for UI
export const CODE_LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  PLAINTEXT: "Plain Text",
  JAVASCRIPT: "JavaScript",
  TYPESCRIPT: "TypeScript",
  HTML: "HTML",
  CSS: "CSS",
  C: "C",
  CPP: "C++",
  RUST: "Rust",
  GO: "Go",
  JAVA: "Java",
  KOTLIN: "Kotlin",
  SCALA: "Scala",
  PYTHON: "Python",
  RUBY: "Ruby",
  PHP: "PHP",
  PERL: "Perl",
  SWIFT: "Swift",
  DART: "Dart",
  CSHARP: "C#",
  FSHARP: "F#",
  HASKELL: "Haskell",
  ELIXIR: "Elixir",
  CLOJURE: "Clojure",
  SQL: "SQL",
  GRAPHQL: "GraphQL",
  R: "R",
  JSON: "JSON",
  YAML: "YAML",
  XML: "XML",
  TOML: "TOML",
  MARKDOWN: "Markdown",
  BASH: "Bash",
  POWERSHELL: "PowerShell",
  DOCKER: "Dockerfile",
  REGEX: "Regex",
};

// All available languages for dropdowns
export const CODE_LANGUAGES: CodeLanguage[] = [
  "PLAINTEXT",
  "JAVASCRIPT",
  "TYPESCRIPT",
  "HTML",
  "CSS",
  "C",
  "CPP",
  "RUST",
  "GO",
  "JAVA",
  "KOTLIN",
  "SCALA",
  "PYTHON",
  "RUBY",
  "PHP",
  "PERL",
  "SWIFT",
  "DART",
  "CSHARP",
  "FSHARP",
  "HASKELL",
  "ELIXIR",
  "CLOJURE",
  "SQL",
  "GRAPHQL",
  "R",
  "JSON",
  "YAML",
  "XML",
  "TOML",
  "MARKDOWN",
  "BASH",
  "POWERSHELL",
  "DOCKER",
  "REGEX",
];

// ============================================
// Autoplay Mode Types
// ============================================

export type LoopMode = 'none' | 'all' | 'single';
export type AutoplayPhase = 'idle' | 'front' | 'pause' | 'back' | 'transition';

export interface AutoplaySettings {
  voice: string;
  pauseDuration: number; // seconds (0-60)
  volume: number; // 0-1
  loopMode: LoopMode;
  isShuffled: boolean;
  showFront: boolean; // whether to display/read front of card
  showBack: boolean; // whether to display/read back of card
}

export interface TTSVoice {
  id: string;
  name: string;
  locale: string;
  gender: 'Male' | 'Female';
}

// ============================================
// Request/Response Types
// ============================================

export interface CreateDeckRequest {
  name: string;
  description?: string;
  shuffleCards?: boolean;
}

export interface UpdateDeckRequest {
  name: string;
  description?: string;
  shuffleCards?: boolean;
}

export interface CreateCardRequest {
  front: string;
  frontType?: ContentType;
  frontLanguage?: CodeLanguage;
  back: string;
  backType?: ContentType;
  backLanguage?: CodeLanguage;
  notes?: string;
  ttsLang?: TtsLang | null;
}

export interface UpdateCardRequest {
  front: string;
  frontType?: ContentType;
  frontLanguage?: CodeLanguage;
  back: string;
  backType?: ContentType;
  backLanguage?: CodeLanguage;
  notes?: string;
  ttsLang?: TtsLang | null;
}

// ============================================
// Quiz Types
// ============================================

export type QuestionType = "multiple_choice" | "fill_in_blank";

export interface Quiz {
  id: string;
  name: string;
  description: string | null;
  shuffleQuestions: boolean;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
  questionCount?: number;
  isFavorite?: boolean;
}

export interface QuestionTag {
  id: string;
  name: string;
}

export interface QuizTag {
  id: string;
  quizId: string;
  name: string;
}

export interface Question {
  id: string;
  quizId: string;
  questionType: QuestionType;
  content: string;
  contentType: ContentType;
  contentLanguage: CodeLanguage | null;
  correctAnswer: string | null; // For fill_in_blank
  multipleAnswers: boolean; // For multiple_choice
  explanation: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  choices: Choice[];
  tags: QuestionTag[];
}

export interface Choice {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  position: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  questionResults: QuestionResult[];
}

export interface QuestionResult {
  id: string;
  attemptId: string;
  questionId: string;
  userAnswer: string | null;
  isCorrect: boolean;
}

export interface QuizStats {
  quizId: string;
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  averageDurationSeconds: number | null;
  lastAttemptAt: string | null;
  recentScores: number[]; // Last 5 attempts
}

// ============================================
// Study Session Types
// ============================================

export interface StudySession {
  id: string;
  deckId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  cardsStudied: number;
}

export interface DeckStudyStats {
  deckId: string;
  totalSessions: number;
  totalStudyTimeSeconds: number;
  totalCardsStudied: number;
  lastStudiedAt: string | null;
}

// ============================================
// Quiz Request Types
// ============================================

export interface CreateQuizRequest {
  name: string;
  description?: string;
  shuffleQuestions?: boolean;
}

export interface UpdateQuizRequest {
  name: string;
  description?: string;
  shuffleQuestions?: boolean;
}

export interface CreateQuestionRequest {
  questionType: QuestionType;
  content: string;
  contentType?: ContentType;
  contentLanguage?: CodeLanguage;
  correctAnswer?: string;
  multipleAnswers?: boolean;
  explanation?: string;
  choices?: CreateChoiceRequest[];
}

export interface UpdateQuestionRequest {
  questionType: QuestionType;
  content: string;
  contentType?: ContentType;
  contentLanguage?: CodeLanguage;
  correctAnswer?: string;
  multipleAnswers?: boolean;
  explanation?: string;
}

export interface CreateChoiceRequest {
  text: string;
  isCorrect: boolean;
}

export interface QuestionAnswer {
  questionId: string;
  answer: string; // Choice IDs (comma-separated) or text for fill_in_blank
}

export interface SubmitQuizRequest {
  answers: QuestionAnswer[];
}

// ============================================
// Course Types (Lesson-based)
// ============================================

export type LessonItemType = "deck" | "quiz";
export type RequirementType = "study" | "review" | "complete" | "min_score";

export interface Course {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  lessonCount?: number;
  completedLessonCount?: number;
  isFavorite?: boolean;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  items: LessonItem[];
  isCompleted?: boolean;
  completedItemCount?: number;
}

export interface LessonItem {
  id: string;
  lessonId: string;
  itemType: LessonItemType;
  itemId: string | null; // NULL if item not yet imported
  itemName: string;
  requirementType: RequirementType | null;
  requirementValue: number | null; // For min_score: the percentage
  position: number;
  createdAt: string;
  isCompleted?: boolean;
  isMissing?: boolean; // True if itemId is NULL
  bestScore?: number; // For quizzes: best score in course context
}

export interface LessonProgress {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  lessonItemId: string;
  completedAt: string | null;
  scorePercentage: number | null;
  attemptId: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseRequest {
  name: string;
  description?: string;
}

export interface UpdateCourseRequest {
  name: string;
  description?: string;
}

export interface CreateLessonRequest {
  title: string;
  description?: string;
  position?: number;
}

export interface UpdateLessonRequest {
  title: string;
  description?: string;
}

export interface AddLessonItemRequest {
  itemType: string;
  itemName: string;
  itemId?: string;
  requirementType?: string;
  requirementValue?: number;
  position?: number;
}

export interface ReorderLessonsRequest {
  lessonIds: string[];
}

export interface ReorderLessonItemsRequest {
  itemIds: string[];
}

export interface LinkItemsResult {
  itemsLinked: number;
  itemsNotFound: string[];
}

export interface CourseImportResult {
  course: Course;
  decksImported: number;
  quizzesImported: number;
  itemsLinked: number;
}

// ============================================
// Notebook Types (Notes Feature)
// ============================================

export interface Notebook {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  pageCount?: number;
  isFavorite?: boolean;
}

export interface Page {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  position: number;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageSearchResult {
  id: string;
  notebookId: string;
  title: string;
  notebookName: string;
  updatedAt: string;
}

export interface CreateNotebookRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface UpdateNotebookRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface CreatePageRequest {
  title: string;
  content?: string;
  position?: number;
}

export interface UpdatePageRequest {
  title: string;
  content: string;
  isPinned?: boolean;
}

export interface ReorderPagesRequest {
  pageIds: string[];
}

export type NotesViewMode = 'card' | 'list';

// ============================================
// App Settings Types
// ============================================

export interface EditorSettings {
  autoSave: boolean;
  autoSaveDelay: number; // milliseconds
  fontSize: number;
  showLineNumbers: boolean;
  spellCheck: boolean;
}

export interface SidebarSettings {
  defaultCollapsed: boolean;
  width: number;
  showPageCount: boolean;
}

export interface AppSettings {
  editor: EditorSettings;
  sidebar: SidebarSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  editor: {
    autoSave: true,
    autoSaveDelay: 2000,
    fontSize: 16,
    showLineNumbers: false,
    spellCheck: true,
  },
  sidebar: {
    defaultCollapsed: false,
    width: 256,
    showPageCount: true,
  },
};

// ============================================
// Keyboard Shortcuts Types
// ============================================

export type ShortcutScope = 'global' | 'notes' | 'decks' | 'quizzes' | 'study';

export interface ShortcutKey {
  key: string;           // The key (e.g., 's', 'Enter', 'Escape')
  ctrl?: boolean;        // Ctrl (Windows/Linux) or Cmd (Mac)
  alt?: boolean;         // Alt (Windows/Linux) or Option (Mac)
  shift?: boolean;       // Shift key
  meta?: boolean;        // Windows key or Cmd (explicit, usually use ctrl which maps to Cmd on Mac)
}

export interface Shortcut {
  id: string;            // Unique identifier (e.g., 'save', 'new-page')
  keys: ShortcutKey;     // Key combination
  label: string;         // Display name (e.g., 'Save')
  description?: string;  // Optional longer description
  scope: ShortcutScope;  // Where this shortcut is active
  action: () => void;    // Function to execute
}

export interface ShortcutGroup {
  scope: ShortcutScope;
  label: string;         // Display name for the group (e.g., 'Notes')
  shortcuts: Shortcut[];
}
