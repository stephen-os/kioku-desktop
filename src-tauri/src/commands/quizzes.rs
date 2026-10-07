use tauri::State;

use crate::db::{
    self, CreateChoiceRequest, CreateQuestionRequest, CreateQuizRequest, DbState, Question,
    QuestionTag, Quiz, QuizAttempt, QuizStats, QuizTag, SubmitQuizRequest, UpdateQuestionRequest,
    UpdateQuizRequest,
};

// ============================================
// Quiz Tag Commands
// ============================================

#[tauri::command]
pub fn get_tags_for_quiz(state: State<DbState>, quiz_id: String) -> Result<Vec<QuizTag>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_tags_for_quiz(&conn, &quiz_id)
}

#[tauri::command]
pub fn get_tags_for_question(
    state: State<DbState>,
    question_id: String,
) -> Result<Vec<QuestionTag>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_tags_for_question(&conn, &question_id)
}

#[tauri::command]
pub fn create_quiz_tag(
    state: State<DbState>,
    quiz_id: String,
    name: String,
) -> Result<QuizTag, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_quiz_tag(&conn, &quiz_id, &name)
}

#[tauri::command]
pub fn delete_quiz_tag(
    state: State<DbState>,
    quiz_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::delete_quiz_tag(&conn, &quiz_id, &tag_id)
}

#[tauri::command]
pub fn add_tag_to_question(
    state: State<DbState>,
    question_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::add_tag_to_question(&conn, &question_id, &tag_id)
}

#[tauri::command]
pub fn remove_tag_from_question(
    state: State<DbState>,
    question_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::remove_tag_from_question(&conn, &question_id, &tag_id)
}

// ============================================
// Quiz Commands
// ============================================

#[tauri::command]
pub fn get_all_quizzes(state: State<DbState>) -> Result<Vec<Quiz>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::get_all_quizzes(&conn, &active_user.id)
}

#[tauri::command]
pub fn get_quiz(state: State<DbState>, quiz_id: String) -> Result<Quiz, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::get_quiz(&conn, &active_user.id, &quiz_id)
}

#[tauri::command]
pub fn create_quiz(state: State<DbState>, request: CreateQuizRequest) -> Result<Quiz, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::create_quiz(&conn, &active_user.id, &request)
}

#[tauri::command]
pub fn update_quiz(
    state: State<DbState>,
    quiz_id: String,
    request: UpdateQuizRequest,
) -> Result<Quiz, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::update_quiz(&conn, &active_user.id, &quiz_id, &request)
}

#[tauri::command]
pub fn delete_quiz(state: State<DbState>, quiz_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::delete_quiz(&conn, &active_user.id, &quiz_id)
}

// ============================================
// Question Commands
// ============================================

#[tauri::command]
pub fn get_questions_for_quiz(
    state: State<DbState>,
    quiz_id: String,
) -> Result<Vec<Question>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_questions_for_quiz(&conn, &quiz_id)
}

#[tauri::command]
pub fn get_question(state: State<DbState>, question_id: String) -> Result<Question, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_question(&conn, &question_id)
}

#[tauri::command]
pub fn create_question(
    state: State<DbState>,
    quiz_id: String,
    request: CreateQuestionRequest,
) -> Result<Question, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_question(&conn, &quiz_id, &request)
}

#[tauri::command]
pub fn update_question(
    state: State<DbState>,
    question_id: String,
    request: UpdateQuestionRequest,
) -> Result<Question, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::update_question(&conn, &question_id, &request)
}

#[tauri::command]
pub fn delete_question(state: State<DbState>, question_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::delete_question(&conn, &question_id)
}

#[tauri::command]
pub fn reorder_questions(
    state: State<DbState>,
    quiz_id: String,
    question_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::reorder_questions(&conn, &quiz_id, &question_ids)
}

#[tauri::command]
pub fn update_question_choices(
    state: State<DbState>,
    question_id: String,
    choices: Vec<CreateChoiceRequest>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::update_choices_for_question(&conn, &question_id, &choices)
}

// ============================================
// Quiz Attempt Commands
// ============================================

#[tauri::command]
pub fn start_quiz_attempt(state: State<DbState>, quiz_id: String) -> Result<QuizAttempt, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::start_quiz_attempt(&conn, &quiz_id)
}

#[tauri::command]
pub fn submit_quiz_attempt(
    state: State<DbState>,
    attempt_id: String,
    request: SubmitQuizRequest,
) -> Result<QuizAttempt, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::submit_quiz_attempt(&conn, &attempt_id, &request.answers)
}

#[tauri::command]
pub fn get_quiz_attempt(state: State<DbState>, attempt_id: String) -> Result<QuizAttempt, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_quiz_attempt(&conn, &attempt_id)
}

#[tauri::command]
pub fn get_quiz_attempts(
    state: State<DbState>,
    quiz_id: String,
) -> Result<Vec<QuizAttempt>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_quiz_attempts(&conn, &quiz_id)
}

#[tauri::command]
pub fn get_quiz_stats(state: State<DbState>, quiz_id: String) -> Result<QuizStats, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_quiz_stats(&conn, &quiz_id)
}

// ============================================
// Quiz Favorite Commands
// ============================================

#[tauri::command]
pub fn toggle_quiz_favorite(state: State<DbState>, quiz_id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::toggle_quiz_favorite(&conn, &active_user.id, &quiz_id)
}
