use rusqlite::params;
use tauri::State;

use crate::db::{
    self, AddLessonItemRequest, Card, Course, CreateCourseRequest, CreateLessonRequest, DbState,
    Deck, Lesson, LessonItem, LessonProgress, Page, QuestionAnswer, Quiz, QuizAttempt,
    ReorderLessonItemsRequest, ReorderLessonsRequest, UpdateCourseRequest, UpdateLessonRequest,
};

// ============================================
// Course Commands
// ============================================

#[tauri::command]
pub fn get_all_courses(state: State<DbState>) -> Result<Vec<Course>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_all_courses(&conn, &active_user.id)
}

#[tauri::command]
pub fn get_course(state: State<DbState>, id: String) -> Result<Option<Course>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_course(&conn, &active_user.id, &id)
}

#[tauri::command]
pub fn get_course_with_lessons(
    state: State<DbState>,
    id: String,
) -> Result<Option<Course>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_course_with_lessons(&conn, &active_user.id, &id)
}

#[tauri::command]
pub fn create_course(
    state: State<DbState>,
    request: CreateCourseRequest,
) -> Result<Course, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::create_course(
        &conn,
        &active_user.id,
        &request.name,
        request.description.as_deref(),
    )
}

#[tauri::command]
pub fn update_course(
    state: State<DbState>,
    id: String,
    request: UpdateCourseRequest,
) -> Result<Course, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::update_course(
        &conn,
        &active_user.id,
        &id,
        &request.name,
        request.description.as_deref(),
    )
}

#[tauri::command]
pub fn delete_course(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::delete_course(&conn, &active_user.id, &id)
}

#[tauri::command]
pub fn toggle_course_favorite(state: State<DbState>, course_id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::toggle_course_favorite(&conn, &active_user.id, &course_id)
}

// ============================================
// Lesson Commands
// ============================================

#[tauri::command]
pub fn get_lessons(state: State<DbState>, course_id: String) -> Result<Vec<Lesson>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_lessons(&conn, &active_user.id, &course_id)
}

#[tauri::command]
pub fn get_lesson(state: State<DbState>, lesson_id: String) -> Result<Option<Lesson>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_lesson(&conn, &active_user.id, &lesson_id)
}

#[tauri::command]
pub fn create_lesson(
    state: State<DbState>,
    course_id: String,
    request: CreateLessonRequest,
) -> Result<Lesson, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_lesson(
        &conn,
        &course_id,
        &request.title,
        request.description.as_deref(),
        request.position,
    )
}

#[tauri::command]
pub fn update_lesson(
    state: State<DbState>,
    lesson_id: String,
    request: UpdateLessonRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::update_lesson(&conn, &lesson_id, &request.title, request.description.as_deref())
}

#[tauri::command]
pub fn delete_lesson(state: State<DbState>, lesson_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::delete_lesson(&conn, &lesson_id)
}

#[tauri::command]
pub fn reorder_lessons(
    state: State<DbState>,
    course_id: String,
    request: ReorderLessonsRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::reorder_lessons(&conn, &course_id, &request.lesson_ids)
}

// ============================================
// Lesson Item Commands
// ============================================

#[tauri::command]
pub fn get_lesson_items(
    state: State<DbState>,
    lesson_id: String,
) -> Result<Vec<LessonItem>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_lesson_items(&conn, &active_user.id, &lesson_id)
}

#[tauri::command]
pub fn add_lesson_item(
    state: State<DbState>,
    lesson_id: String,
    request: AddLessonItemRequest,
) -> Result<LessonItem, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::add_lesson_item(
        &conn,
        &lesson_id,
        &request.item_type,
        &request.item_name,
        request.item_id.as_deref(),
        request.requirement_type.as_deref(),
        request.requirement_value,
        request.position,
    )
}

#[tauri::command]
pub fn remove_lesson_item(state: State<DbState>, lesson_item_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Delete the course-owned content this item points at, then the item itself.
    let row: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT item_type, item_id FROM lesson_items WHERE id = ?1",
            params![lesson_item_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    if let Some((item_type, Some(item_id))) = row {
        match item_type.as_str() {
            "deck" => db::delete_course_deck(&conn, &item_id)?,
            "quiz" => db::delete_course_quiz(&conn, &item_id)?,
            "note" => {
                // item_id is a course_page; delete its owning notebook (cascades the page).
                if let Ok(nb) = conn.query_row(
                    "SELECT course_notebook_id FROM course_pages WHERE id = ?1",
                    params![item_id],
                    |r| r.get::<_, String>(0),
                ) {
                    db::delete_course_notebook(&conn, &nb)?;
                }
            }
            _ => {}
        }
    }

    db::remove_lesson_item(&conn, &lesson_item_id)
}

/// Create a lesson item backed by course-owned content — either copied from a
/// library deck/quiz/note (`mode = "library"`, `source_id` = the library id) or
/// a new blank one to edit in the course (`mode = "blank"`).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn course_add_item(
    state: State<DbState>,
    lesson_id: String,
    item_type: String,
    mode: String,
    source_id: Option<String>,
    name: String,
    requirement_type: Option<String>,
    requirement_value: Option<i32>,
) -> Result<LessonItem, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let course_id: String = conn
        .query_row(
            "SELECT course_id FROM lessons WHERE id = ?1",
            params![lesson_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Lesson not found: {}", e))?;

    let src = || -> Result<String, String> {
        source_id
            .clone()
            .ok_or_else(|| "A source item is required to copy from the library".to_string())
    };

    let content_id = match (item_type.as_str(), mode.as_str()) {
        ("deck", "library") => db::copy_deck_to_course(&conn, &course_id, &src()?)?,
        ("deck", _) => db::create_course_deck(&conn, &course_id, &name, None, false)?,
        ("quiz", "library") => db::copy_quiz_to_course(&conn, &course_id, &src()?)?,
        ("quiz", _) => db::create_course_quiz(&conn, &course_id, &name, None, false)?,
        ("note", "library") => db::copy_page_to_course(&conn, &course_id, &src()?)?,
        ("note", _) => {
            let nb = db::create_course_notebook(&conn, &course_id, &name, None)?;
            db::create_course_page(&conn, &nb, &name, "", 0)?
        }
        _ => return Err(format!("Unsupported lesson item type: {}", item_type)),
    };

    db::add_lesson_item(
        &conn,
        &lesson_id,
        &item_type,
        &name,
        Some(&content_id),
        requirement_type.as_deref(),
        requirement_value,
        None,
    )
}

#[tauri::command]
pub fn adopt_course_deck(state: State<DbState>, course_deck_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::adopt_course_deck(&conn, &user.id, &course_deck_id)
}

#[tauri::command]
pub fn adopt_course_quiz(state: State<DbState>, course_quiz_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::adopt_course_quiz(&conn, &user.id, &course_quiz_id)
}

#[tauri::command]
pub fn adopt_course_page(state: State<DbState>, course_page_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::adopt_course_page(&conn, &user.id, &course_page_id)
}

/// Grade a course quiz in-memory (not persisted to quiz_attempts) and return a
/// QuizAttempt-shaped result for the results screen.
#[tauri::command]
pub fn grade_course_quiz(
    state: State<DbState>,
    course_quiz_id: String,
    answers: Vec<QuestionAnswer>,
) -> Result<QuizAttempt, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::grade_course_quiz(&conn, &course_quiz_id, &answers)
}

#[tauri::command]
pub fn reorder_lesson_items(
    state: State<DbState>,
    lesson_id: String,
    request: ReorderLessonItemsRequest,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::reorder_lesson_items(&conn, &lesson_id, &request.item_ids)
}

#[tauri::command]
pub fn update_lesson_item_reference(
    state: State<DbState>,
    lesson_item_id: String,
    item_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::update_lesson_item_reference(&conn, &lesson_item_id, &item_id)
}

// ============================================
// Lesson Progress Commands
// ============================================

#[tauri::command]
pub fn record_lesson_progress(
    state: State<DbState>,
    course_id: String,
    lesson_id: String,
    lesson_item_id: String,
    score_percentage: Option<i32>,
    attempt_id: Option<String>,
    session_id: Option<String>,
) -> Result<LessonProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::record_lesson_progress(
        &conn,
        &active_user.id,
        &course_id,
        &lesson_id,
        &lesson_item_id,
        score_percentage,
        attempt_id.as_deref(),
        session_id.as_deref(),
    )
}

#[tauri::command]
pub fn clear_lesson_item_progress(
    state: State<DbState>,
    lesson_item_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::clear_lesson_item_progress(&conn, &active_user.id, &lesson_item_id)
}

#[tauri::command]
pub fn get_lesson_progress(
    state: State<DbState>,
    course_id: String,
) -> Result<Vec<LessonProgress>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_lesson_progress(&conn, &active_user.id, &course_id)
}

#[tauri::command]
pub fn reset_course_progress(state: State<DbState>, course_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::reset_course_progress(&conn, &active_user.id, &course_id)
}

// ============================================
// Course-Owned Content (read; studied/taken/read with the shared engines)
// ============================================

#[tauri::command]
pub fn get_course_deck(state: State<DbState>, course_deck_id: String) -> Result<Deck, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_course_deck(&conn, &course_deck_id)
}

#[tauri::command]
pub fn get_course_cards(state: State<DbState>, course_deck_id: String) -> Result<Vec<Card>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_course_cards(&conn, &course_deck_id)
}

#[tauri::command]
pub fn get_course_quiz(state: State<DbState>, course_quiz_id: String) -> Result<Quiz, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_course_quiz(&conn, &course_quiz_id)
}

#[tauri::command]
pub fn get_course_page(state: State<DbState>, course_page_id: String) -> Result<Page, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_course_page(&conn, &course_page_id)
}

// ============================================
// Utility: Link missing items
// ============================================

#[tauri::command]
pub fn link_course_items(
    state: State<DbState>,
    course_id: String,
) -> Result<LinkItemsResult, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user =
        db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    let (items_linked, items_not_found) =
        db::link_lesson_items_by_name(&conn, &active_user.id, &course_id)?;
    Ok(LinkItemsResult {
        items_linked,
        items_not_found,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkItemsResult {
    pub items_linked: i32,
    pub items_not_found: Vec<String>,
}
