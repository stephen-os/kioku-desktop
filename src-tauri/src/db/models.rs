use serde::{Deserialize, Serialize};

// ============================================
// Deck Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub shuffle_cards: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub deck_id: String,
    pub front: String,
    pub front_type: String,
    pub front_language: Option<String>,
    pub back: String,
    pub back_type: String,
    pub back_language: Option<String>,
    pub notes: Option<String>,
    /// Spoken language for read-aloud (TTS) per side: en/es/fr/zh/ja/ko. None => English.
    pub front_tts_lang: Option<String>,
    pub back_tts_lang: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<CardTag>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardTag {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub deck_id: String,
    pub name: String,
}

// ============================================
// Quiz Models
// ============================================

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    MultipleChoice,
    FillInBlank,
}

impl QuestionType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "fill_in_blank" => QuestionType::FillInBlank,
            _ => QuestionType::MultipleChoice,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            QuestionType::MultipleChoice => "multiple_choice",
            QuestionType::FillInBlank => "fill_in_blank",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Quiz {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub shuffle_questions: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub questions: Vec<Question>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    pub quiz_id: String,
    pub question_type: QuestionType,
    pub content: String,
    pub content_type: String,
    pub content_language: Option<String>,
    pub correct_answer: Option<String>,
    pub multiple_answers: bool,
    pub explanation: Option<String>,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub choices: Vec<Choice>,
    #[serde(default)]
    pub tags: Vec<QuestionTag>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub id: String,
    pub question_id: String,
    pub text: String,
    pub is_correct: bool,
    pub position: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuizTag {
    pub id: String,
    pub quiz_id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionTag {
    pub id: String,
    pub name: String,
}

// ============================================
// Statistics Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuizAttempt {
    pub id: String,
    pub quiz_id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub duration_seconds: Option<i32>,
    pub total_questions: i32,
    pub correct_answers: i32,
    pub score_percentage: i32,
    #[serde(default)]
    pub question_results: Vec<QuestionResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuestionResult {
    pub id: String,
    pub attempt_id: String,
    pub question_id: String,
    pub user_answer: Option<String>,
    pub is_correct: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StudySession {
    pub id: String,
    pub deck_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i32>,
    pub cards_studied: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QuizStats {
    pub quiz_id: String,
    pub total_attempts: i32,
    pub average_score: f64,
    pub best_score: i32,
    pub average_duration_seconds: Option<i32>,
    pub last_attempt_at: Option<String>,
    pub recent_scores: Vec<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeckStudyStats {
    pub deck_id: String,
    pub total_sessions: i32,
    pub total_study_time_seconds: i32,
    pub total_cards_studied: i32,
    pub last_studied_at: Option<String>,
}

// ============================================
// User Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalUser {
    pub id: String,
    pub name: String,
    pub has_password: bool,
    pub avatar: String,
    pub created_at: String,
    pub last_login_at: Option<String>,
}

// ============================================
// Course Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Course {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lesson_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_lesson_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
    #[serde(default)]
    pub lessons: Vec<Lesson>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCourseRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCourseRequest {
    pub name: String,
    pub description: Option<String>,
}

// ============================================
// Lesson Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    pub id: String,
    pub course_id: String,
    pub title: String,
    pub description: Option<String>,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub items: Vec<LessonItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_item_count: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LessonItemType {
    Deck,
    Quiz,
}

impl LessonItemType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "quiz" => LessonItemType::Quiz,
            _ => LessonItemType::Deck,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementType {
    Study,      // For decks: complete a study session
    Review,     // For decks: just open/view the deck
    Complete,   // For quizzes: just finish the quiz
    MinScore,   // For quizzes: score at least X%
}

impl RequirementType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "study" => Some(RequirementType::Study),
            "review" => Some(RequirementType::Review),
            "complete" => Some(RequirementType::Complete),
            "min_score" => Some(RequirementType::MinScore),
            _ => None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LessonItem {
    pub id: String,
    pub lesson_id: String,
    pub item_type: LessonItemType,
    pub item_id: Option<String>,  // NULL if item not yet imported
    pub item_name: String,
    pub requirement_type: Option<RequirementType>,
    pub requirement_value: Option<i32>,  // For min_score: the percentage
    pub position: i32,
    pub created_at: String,
    // Populated by query
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_completed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_missing: Option<bool>,  // True if item_id is NULL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best_score: Option<i32>,   // For quizzes: best score in course context
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LessonProgress {
    pub id: String,
    pub user_id: String,
    pub course_id: String,
    pub lesson_id: String,
    pub lesson_item_id: String,
    pub completed_at: Option<String>,
    pub score_percentage: Option<i32>,
    pub attempt_id: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLessonRequest {
    pub title: String,
    pub description: Option<String>,
    pub position: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLessonRequest {
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddLessonItemRequest {
    pub item_type: String,
    pub item_name: String,
    pub item_id: Option<String>,
    pub requirement_type: Option<String>,
    pub requirement_value: Option<i32>,
    pub position: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderLessonsRequest {
    pub lesson_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderLessonItemsRequest {
    pub item_ids: Vec<String>,
}

// ============================================
// Request Types
// ============================================

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDeckRequest {
    pub name: String,
    pub description: Option<String>,
    pub shuffle_cards: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckRequest {
    pub name: String,
    pub description: Option<String>,
    pub shuffle_cards: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardRequest {
    pub front: String,
    pub front_type: Option<String>,
    pub front_language: Option<String>,
    pub back: String,
    pub back_type: Option<String>,
    pub back_language: Option<String>,
    pub notes: Option<String>,
    pub front_tts_lang: Option<String>,
    pub back_tts_lang: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardRequest {
    pub front: String,
    pub front_type: Option<String>,
    pub front_language: Option<String>,
    pub back: String,
    pub back_type: Option<String>,
    pub back_language: Option<String>,
    pub notes: Option<String>,
    pub front_tts_lang: Option<String>,
    pub back_tts_lang: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuizRequest {
    pub name: String,
    pub description: Option<String>,
    pub shuffle_questions: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateQuizRequest {
    pub name: String,
    pub description: Option<String>,
    pub shuffle_questions: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuestionRequest {
    pub question_type: String,
    pub content: String,
    pub content_type: Option<String>,
    pub content_language: Option<String>,
    pub correct_answer: Option<String>,
    pub multiple_answers: Option<bool>,
    pub explanation: Option<String>,
    pub choices: Option<Vec<CreateChoiceRequest>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateQuestionRequest {
    pub question_type: String,
    pub content: String,
    pub content_type: Option<String>,
    pub content_language: Option<String>,
    pub correct_answer: Option<String>,
    pub multiple_answers: Option<bool>,
    pub explanation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateChoiceRequest {
    pub text: String,
    pub is_correct: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitQuizRequest {
    pub answers: Vec<QuestionAnswer>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionAnswer {
    pub question_id: String,
    pub answer: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserRequest {
    pub name: String,
    pub password: Option<String>,
    pub avatar: Option<String>,
}

// ============================================
// Notebook Models
// ============================================

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Notebook {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub position: i32,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNotebookRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotebookRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePageRequest {
    pub title: String,
    pub content: Option<String>,
    pub position: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePageRequest {
    pub title: String,
    pub content: String,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderPagesRequest {
    pub page_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageSearchResult {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub notebook_name: String,
    pub updated_at: String,
}
