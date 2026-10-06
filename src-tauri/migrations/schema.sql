-- ============================================
-- Kioku Desktop Database Schema
-- ============================================

-- ============================================
-- Core: Users & App State
-- ============================================

-- Local Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password_hash TEXT,  -- NULL if no password protection
    avatar TEXT NOT NULL DEFAULT 'avatar-smile',  -- Avatar identifier
    created_at TEXT NOT NULL,
    last_login_at TEXT
);

-- Track which user is currently active
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================
-- Courses (Ordered learning paths with lessons)
-- ============================================

CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- Lessons within a course
CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Lesson items (decks/quizzes within a lesson with optional requirements)
CREATE TABLE IF NOT EXISTS lesson_items (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    item_type TEXT NOT NULL,  -- 'deck' or 'quiz'
    item_id TEXT,             -- FK to decks or quizzes (NULL until the referenced deck/quiz is imported)
    item_name TEXT NOT NULL,  -- Name for matching during import
    requirement_type TEXT,    -- NULL, 'study', 'review', 'complete', 'min_score'
    requirement_value INTEGER, -- For min_score: the percentage required (e.g., 80)
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

-- Lesson progress (tracks course-context completion per user)
CREATE TABLE IF NOT EXISTS lesson_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    lesson_item_id TEXT NOT NULL,
    completed_at TEXT,        -- NULL means not completed
    score_percentage INTEGER, -- For quiz attempts in course context
    attempt_id TEXT,          -- Links to quiz_attempts if applicable
    session_id TEXT,          -- Links to study_sessions if applicable
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_item_id) REFERENCES lesson_items(id) ON DELETE CASCADE,
    UNIQUE(user_id, lesson_item_id)
);

-- ============================================
-- Flashcards: Decks, Cards & Tags
-- ============================================

-- Decks table
CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    shuffle_cards INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- Legacy sync fields (unused but kept for compatibility)
    remote_id INTEGER,
    sync_status TEXT NOT NULL DEFAULT 'local_only',
    last_synced_at TEXT,
    remote_updated_at TEXT
);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL,
    front TEXT NOT NULL,
    front_type TEXT NOT NULL DEFAULT 'TEXT',
    front_language TEXT,
    back TEXT NOT NULL,
    back_type TEXT NOT NULL DEFAULT 'TEXT',
    back_language TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    remote_id INTEGER,  -- Legacy: unused, kept for compatibility
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

-- Deck Tags table (tags scoped to a deck)
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL,
    name TEXT NOT NULL,
    remote_id INTEGER,  -- Legacy: unused, kept for compatibility
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

-- Card-Tag junction table
CREATE TABLE IF NOT EXISTS card_tags (
    card_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (card_id, tag_id),
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================
-- Study Sessions
-- ============================================

CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER,
    cards_studied INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

-- ============================================
-- Quizzes: Questions, Choices & Tags
-- ============================================

CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    shuffle_questions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    question_type TEXT NOT NULL,  -- 'multiple_choice' or 'fill_in_blank'
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'TEXT',  -- 'TEXT' or 'CODE'
    content_language TEXT,  -- Programming language if content_type is 'CODE'
    correct_answer TEXT,  -- For fill_in_blank questions
    multiple_answers INTEGER NOT NULL DEFAULT 0,  -- For multiple_choice: allow multiple correct
    explanation TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS choices (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Quiz Tags table (tags scoped to a quiz)
CREATE TABLE IF NOT EXISTS quiz_tags (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Question-Tag junction table
CREATE TABLE IF NOT EXISTS question_tags (
    question_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (question_id, tag_id),
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES quiz_tags(id) ON DELETE CASCADE
);

-- ============================================
-- Quiz Attempts & Results
-- ============================================

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_seconds INTEGER,
    total_questions INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL DEFAULT 0,
    score_percentage INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS question_results (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    user_answer TEXT,
    is_correct INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- ============================================
-- Favorites (user-specific, not exported)
-- ============================================

CREATE TABLE IF NOT EXISTS deck_favorites (
    user_id TEXT NOT NULL,
    deck_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, deck_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_favorites (
    user_id TEXT NOT NULL,
    quiz_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, quiz_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_favorites (
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- ============================================
-- Notes: Notebooks & Pages
-- ============================================

-- Notebooks table (top-level containers for notes)
CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT NOT NULL DEFAULT 'notebook',
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- Pages table (markdown content within notebooks)
CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

-- Notebook favorites (user-specific)
CREATE TABLE IF NOT EXISTS notebook_favorites (
    user_id TEXT NOT NULL,
    notebook_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, notebook_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
);

-- ============================================
-- Indexes
-- ============================================

-- User indexes
CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_user_id ON quizzes(user_id);

-- Deck/Card indexes
CREATE INDEX IF NOT EXISTS idx_decks_sync_status ON decks(sync_status);  -- Legacy: unused
CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_tags_deck_id ON tags(deck_id);
CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag_id ON card_tags(tag_id);

-- Study session indexes
CREATE INDEX IF NOT EXISTS idx_study_sessions_deck_id ON study_sessions(deck_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(started_at);

-- Quiz/Question indexes
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_questions_position ON questions(quiz_id, position);
CREATE INDEX IF NOT EXISTS idx_choices_question_id ON choices(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_tags_quiz_id ON quiz_tags(quiz_id);
CREATE INDEX IF NOT EXISTS idx_question_tags_question_id ON question_tags(question_id);
CREATE INDEX IF NOT EXISTS idx_question_tags_tag_id ON question_tags(tag_id);

-- Quiz attempt indexes
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed_at ON quiz_attempts(completed_at);
CREATE INDEX IF NOT EXISTS idx_question_results_attempt_id ON question_results(attempt_id);
CREATE INDEX IF NOT EXISTS idx_question_results_question_id ON question_results(question_id);

-- Course indexes
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);

-- Lesson indexes
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_position ON lessons(course_id, position);
CREATE INDEX IF NOT EXISTS idx_lesson_items_lesson_id ON lesson_items(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_items_position ON lesson_items(lesson_id, position);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_id ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_course_id ON lesson_progress(course_id);

-- Favorites indexes
CREATE INDEX IF NOT EXISTS idx_deck_favorites_user_id ON deck_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_favorites_deck_id ON deck_favorites(deck_id);
CREATE INDEX IF NOT EXISTS idx_quiz_favorites_user_id ON quiz_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_favorites_quiz_id ON quiz_favorites(quiz_id);
CREATE INDEX IF NOT EXISTS idx_course_favorites_user_id ON course_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_course_favorites_course_id ON course_favorites(course_id);

-- Notebook indexes
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_notebook_id ON pages(notebook_id);
CREATE INDEX IF NOT EXISTS idx_pages_position ON pages(notebook_id, position);
CREATE INDEX IF NOT EXISTS idx_notebook_favorites_user_id ON notebook_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_notebook_favorites_notebook_id ON notebook_favorites(notebook_id);
