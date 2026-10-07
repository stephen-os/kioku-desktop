use serde::Serialize;
use tauri::State;

use crate::db::{
    self, CreateCardRequest, CreateChoiceRequest, CreateQuestionRequest, CreateQuizRequest,
    DbState, Deck, Quiz,
};

const MAX_IMPORT_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    deck: Deck,
    cards_imported: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuizImportResult {
    quiz: Quiz,
    questions_imported: usize,
}

// ============================================
// Deck Import / Export
// ============================================

#[tauri::command]
pub fn import_deck_from_file(
    state: State<DbState>,
    file_path: String,
) -> Result<ImportResult, String> {
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / (1024 * 1024),
            MAX_IMPORT_FILE_SIZE / (1024 * 1024)
        ));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DeckImport {
        name: String,
        description: Option<String>,
        #[serde(default)]
        shuffle_cards: bool,
        cards: Vec<CardImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CardImport {
        front: String,
        back: String,
        #[serde(default = "default_text")]
        front_type: String,
        #[serde(default = "default_text")]
        back_type: String,
        front_language: Option<String>,
        back_language: Option<String>,
        notes: Option<String>,
        #[serde(default)]
        tags: Vec<String>,
    }

    fn default_text() -> String {
        "TEXT".to_string()
    }

    let import_data: DeckImport = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let cards_count = import_data.cards.len();
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<ImportResult, String> {
        let deck = db::create_deck(
            &conn,
            &active_user.id,
            &import_data.name,
            import_data.description.as_deref(),
            import_data.shuffle_cards,
        )?;

        let mut tag_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        for card in import_data.cards {
            let request = CreateCardRequest {
                front: card.front,
                front_type: Some(card.front_type),
                front_language: card.front_language,
                back: card.back,
                back_type: Some(card.back_type),
                back_language: card.back_language,
                notes: card.notes,
            };
            let created_card = db::create_card(&conn, &deck.id, &request)?;

            for tag_name in card.tags {
                let tag_id = if let Some(id) = tag_cache.get(&tag_name) {
                    id.clone()
                } else {
                    let tag = match db::get_tag_by_name(&conn, &deck.id, &tag_name)? {
                        Some(existing) => existing,
                        None => db::create_tag(&conn, &deck.id, &tag_name)?,
                    };
                    tag_cache.insert(tag_name.clone(), tag.id.clone());
                    tag.id
                };
                let _ = db::add_tag_to_card(&conn, &deck.id, &created_card.id, &tag_id);
            }
        }

        let final_deck = db::get_deck(&conn, &active_user.id, &deck.id)?
            .ok_or_else(|| "Failed to retrieve imported deck".to_string())?;
        Ok(ImportResult {
            deck: final_deck,
            cards_imported: cards_count,
        })
    })();

    match result {
        Ok(import_result) => {
            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(import_result)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn export_deck_to_json(state: State<DbState>, deck_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // SECURITY: only the active user may export their own deck.
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    let deck = db::get_deck(&conn, &active_user.id, &deck_id)?
        .ok_or_else(|| format!("Deck not found: {}", deck_id))?;
    let cards = db::get_cards_for_deck(&conn, &deck_id)?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DeckExport {
        name: String,
        description: Option<String>,
        shuffle_cards: bool,
        cards: Vec<CardExport>,
        exported_at: String,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CardExport {
        front: String,
        back: String,
        front_type: String,
        back_type: String,
        front_language: Option<String>,
        back_language: Option<String>,
        notes: Option<String>,
        tags: Vec<String>,
    }

    let export = DeckExport {
        name: deck.name,
        description: deck.description,
        shuffle_cards: deck.shuffle_cards,
        cards: cards
            .into_iter()
            .map(|c| CardExport {
                front: c.front,
                back: c.back,
                front_type: c.front_type,
                back_type: c.back_type,
                front_language: c.front_language,
                back_language: c.back_language,
                notes: c.notes,
                tags: c.tags.into_iter().map(|t| t.name).collect(),
            })
            .collect(),
        exported_at: chrono::Utc::now().to_rfc3339(),
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("Failed to serialize: {}", e))
}

// ============================================
// Quiz Import / Export
// ============================================

#[tauri::command]
pub fn export_quiz_to_json(state: State<DbState>, quiz_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // SECURITY: only the active user may export their own quiz.
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    let quiz = db::get_quiz(&conn, &active_user.id, &quiz_id)?;

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct QuizExport {
        name: String,
        description: Option<String>,
        shuffle_questions: bool,
        questions: Vec<QuestionExport>,
        exported_at: String,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct QuestionExport {
        #[serde(rename = "type")]
        question_type: String,
        content: String,
        content_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content_language: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        correct_answer: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        choices: Vec<ChoiceExport>,
        multiple_answers: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        explanation: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        tags: Vec<String>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChoiceExport {
        text: String,
        is_correct: bool,
    }

    let export = QuizExport {
        name: quiz.name,
        description: quiz.description,
        shuffle_questions: quiz.shuffle_questions,
        questions: quiz
            .questions
            .into_iter()
            .map(|q| QuestionExport {
                question_type: match q.question_type {
                    db::QuestionType::MultipleChoice => "multiple_choice".to_string(),
                    db::QuestionType::FillInBlank => "fill_in_blank".to_string(),
                },
                content: q.content,
                content_type: q.content_type,
                content_language: q.content_language,
                correct_answer: q.correct_answer,
                choices: q
                    .choices
                    .into_iter()
                    .map(|c| ChoiceExport {
                        text: c.text,
                        is_correct: c.is_correct,
                    })
                    .collect(),
                multiple_answers: q.multiple_answers,
                explanation: q.explanation,
                tags: q.tags.into_iter().map(|t| t.name).collect(),
            })
            .collect(),
        exported_at: chrono::Utc::now().to_rfc3339(),
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("Failed to serialize: {}", e))
}

#[tauri::command]
pub fn import_quiz_from_file(
    state: State<DbState>,
    file_path: String,
) -> Result<QuizImportResult, String> {
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / (1024 * 1024),
            MAX_IMPORT_FILE_SIZE / (1024 * 1024)
        ));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct QuizImport {
        name: String,
        description: Option<String>,
        #[serde(default)]
        shuffle_questions: bool,
        questions: Vec<QuestionImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct QuestionImport {
        #[serde(rename = "type")]
        question_type: String,
        content: String,
        #[serde(default = "default_text")]
        content_type: String,
        content_language: Option<String>,
        #[serde(default)]
        choices: Vec<ChoiceImport>,
        #[serde(default)]
        multiple_answers: bool,
        correct_answer: Option<String>,
        explanation: Option<String>,
        #[serde(default)]
        tags: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ChoiceImport {
        text: String,
        #[serde(default)]
        is_correct: bool,
    }

    fn default_text() -> String {
        "TEXT".to_string()
    }

    let import_data: QuizImport = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let questions_count = import_data.questions.len();
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<QuizImportResult, String> {
        let quiz_request = CreateQuizRequest {
            name: import_data.name,
            description: import_data.description,
            shuffle_questions: Some(import_data.shuffle_questions),
        };
        let quiz = db::create_quiz(&conn, &active_user.id, &quiz_request)?;

        let mut tag_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        for question in import_data.questions {
            let question_request = CreateQuestionRequest {
                question_type: question.question_type,
                content: question.content,
                content_type: Some(question.content_type),
                content_language: question.content_language,
                correct_answer: question.correct_answer,
                multiple_answers: Some(question.multiple_answers),
                explanation: question.explanation,
                choices: Some(
                    question
                        .choices
                        .into_iter()
                        .map(|c| CreateChoiceRequest {
                            text: c.text,
                            is_correct: c.is_correct,
                        })
                        .collect(),
                ),
            };
            let created_question = db::create_question(&conn, &quiz.id, &question_request)?;

            for tag_name in question.tags {
                let tag_id = if let Some(id) = tag_cache.get(&tag_name) {
                    id.clone()
                } else {
                    let tag = match db::get_quiz_tag_by_name(&conn, &quiz.id, &tag_name)? {
                        Some(existing) => existing,
                        None => db::create_quiz_tag(&conn, &quiz.id, &tag_name)?,
                    };
                    tag_cache.insert(tag_name.clone(), tag.id.clone());
                    tag.id
                };
                let _ = db::add_tag_to_question(&conn, &created_question.id, &tag_id);
            }
        }

        let final_quiz = db::get_quiz(&conn, &active_user.id, &quiz.id)?;
        Ok(QuizImportResult {
            quiz: final_quiz,
            questions_imported: questions_count,
        })
    })();

    match result {
        Ok(import_result) => {
            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(import_result)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ============================================
// Course Bundle Import / Export
// ============================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseImportResult {
    course: db::Course,
    decks_imported: i32,
    quizzes_imported: i32,
    items_linked: i32,
}

#[tauri::command]
pub fn import_course_from_file(
    state: State<DbState>,
    file_path: String,
) -> Result<CourseImportResult, String> {
    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE {
        return Err(format!(
            "File too large: {} MB (max {} MB)",
            metadata.len() / (1024 * 1024),
            MAX_IMPORT_FILE_SIZE / (1024 * 1024)
        ));
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Course bundle format with embedded decks and quizzes
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CourseBundleImport {
        name: String,
        description: Option<String>,
        lessons: Vec<LessonImport>,
        #[serde(default)]
        decks: Vec<DeckImport>,
        #[serde(default)]
        quizzes: Vec<QuizImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LessonImport {
        title: String,
        description: Option<String>,
        items: Vec<LessonItemImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LessonItemImport {
        #[serde(rename = "type")]
        item_type: String,
        name: String,
        requirement_type: Option<String>,
        requirement_value: Option<i32>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct DeckImport {
        name: String,
        description: Option<String>,
        #[serde(default)]
        shuffle_cards: bool,
        cards: Vec<CardImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CardImport {
        front: String,
        back: String,
        #[serde(default = "default_text")]
        front_type: String,
        #[serde(default = "default_text")]
        back_type: String,
        front_language: Option<String>,
        back_language: Option<String>,
        notes: Option<String>,
        #[serde(default)]
        tags: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct QuizImport {
        name: String,
        description: Option<String>,
        #[serde(default)]
        shuffle_questions: bool,
        questions: Vec<QuestionImport>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct QuestionImport {
        #[serde(rename = "type")]
        question_type: String,
        content: String,
        #[serde(default = "default_text")]
        content_type: String,
        content_language: Option<String>,
        #[serde(default)]
        choices: Vec<ChoiceImport>,
        #[serde(default)]
        multiple_answers: bool,
        correct_answer: Option<String>,
        explanation: Option<String>,
        #[serde(default)]
        tags: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ChoiceImport {
        text: String,
        #[serde(default)]
        is_correct: bool,
    }

    fn default_text() -> String {
        "TEXT".to_string()
    }

    let import_data: CourseBundleImport = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<CourseImportResult, String> {
        // Track imported items by name -> id
        let mut deck_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        let mut quiz_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        // First, import all embedded decks
        for deck_import in &import_data.decks {
            let deck = db::create_deck(
                &conn,
                &active_user.id,
                &deck_import.name,
                deck_import.description.as_deref(),
                deck_import.shuffle_cards,
            )?;

            let mut tag_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();

            for card in &deck_import.cards {
                let request = CreateCardRequest {
                    front: card.front.clone(),
                    front_type: Some(card.front_type.clone()),
                    front_language: card.front_language.clone(),
                    back: card.back.clone(),
                    back_type: Some(card.back_type.clone()),
                    back_language: card.back_language.clone(),
                    notes: card.notes.clone(),
                };
                let created_card = db::create_card(&conn, &deck.id, &request)?;

                for tag_name in &card.tags {
                    let tag_id = if let Some(id) = tag_cache.get(tag_name) {
                        id.clone()
                    } else {
                        let tag = match db::get_tag_by_name(&conn, &deck.id, tag_name)? {
                            Some(existing) => existing,
                            None => db::create_tag(&conn, &deck.id, tag_name)?,
                        };
                        tag_cache.insert(tag_name.clone(), tag.id.clone());
                        tag.id
                    };
                    let _ = db::add_tag_to_card(&conn, &deck.id, &created_card.id, &tag_id);
                }
            }

            deck_map.insert(deck_import.name.clone(), deck.id);
        }

        // Then, import all embedded quizzes
        for quiz_import in &import_data.quizzes {
            let quiz_request = CreateQuizRequest {
                name: quiz_import.name.clone(),
                description: quiz_import.description.clone(),
                shuffle_questions: Some(quiz_import.shuffle_questions),
            };
            let quiz = db::create_quiz(&conn, &active_user.id, &quiz_request)?;

            let mut tag_cache: std::collections::HashMap<String, String> = std::collections::HashMap::new();

            for question in &quiz_import.questions {
                let question_request = CreateQuestionRequest {
                    question_type: question.question_type.clone(),
                    content: question.content.clone(),
                    content_type: Some(question.content_type.clone()),
                    content_language: question.content_language.clone(),
                    correct_answer: question.correct_answer.clone(),
                    multiple_answers: Some(question.multiple_answers),
                    explanation: question.explanation.clone(),
                    choices: Some(
                        question
                            .choices
                            .iter()
                            .map(|c| CreateChoiceRequest {
                                text: c.text.clone(),
                                is_correct: c.is_correct,
                            })
                            .collect(),
                    ),
                };
                let created_question = db::create_question(&conn, &quiz.id, &question_request)?;

                for tag_name in &question.tags {
                    let tag_id = if let Some(id) = tag_cache.get(tag_name) {
                        id.clone()
                    } else {
                        let tag = match db::get_quiz_tag_by_name(&conn, &quiz.id, tag_name)? {
                            Some(existing) => existing,
                            None => db::create_quiz_tag(&conn, &quiz.id, tag_name)?,
                        };
                        tag_cache.insert(tag_name.clone(), tag.id.clone());
                        tag.id
                    };
                    let _ = db::add_tag_to_question(&conn, &created_question.id, &tag_id);
                }
            }

            quiz_map.insert(quiz_import.name.clone(), quiz.id);
        }

        // Also check existing decks/quizzes for items not in the bundle
        let all_decks = db::get_all_decks(&conn, &active_user.id)?;
        let all_quizzes = db::get_all_quizzes(&conn, &active_user.id)?;
        for deck in &all_decks {
            if !deck_map.contains_key(&deck.name) {
                deck_map.insert(deck.name.clone(), deck.id.clone());
            }
        }
        for quiz in &all_quizzes {
            if !quiz_map.contains_key(&quiz.name) {
                quiz_map.insert(quiz.name.clone(), quiz.id.clone());
            }
        }

        // Now create the course
        let course = db::create_course(
            &conn,
            &active_user.id,
            &import_data.name,
            import_data.description.as_deref(),
        )?;

        let mut total_items_linked = 0;

        // Create lessons and link items
        for (lesson_pos, lesson_import) in import_data.lessons.iter().enumerate() {
            let lesson = db::create_lesson(
                &conn,
                &course.id,
                &lesson_import.title,
                lesson_import.description.as_deref(),
                Some(lesson_pos as i32),
            )?;

            for (item_pos, item) in lesson_import.items.iter().enumerate() {
                let item_id = match item.item_type.as_str() {
                    "deck" => deck_map.get(&item.name).cloned(),
                    "quiz" => quiz_map.get(&item.name).cloned(),
                    _ => None,
                };

                db::add_lesson_item(
                    &conn,
                    &lesson.id,
                    &item.item_type,
                    &item.name,
                    item_id.as_deref(),
                    item.requirement_type.as_deref(),
                    item.requirement_value,
                    Some(item_pos as i32),
                )?;

                if item_id.is_some() {
                    total_items_linked += 1;
                }
            }
        }

        let final_course = db::get_course_with_lessons(&conn, &active_user.id, &course.id)?
            .ok_or_else(|| "Failed to retrieve imported course".to_string())?;

        Ok(CourseImportResult {
            course: final_course,
            decks_imported: import_data.decks.len() as i32,
            quizzes_imported: import_data.quizzes.len() as i32,
            items_linked: total_items_linked,
        })
    })();

    match result {
        Ok(import_result) => {
            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(import_result)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn export_course_to_json(state: State<DbState>, course_id: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;

    let course = db::get_course_with_lessons(&conn, &active_user.id, &course_id)?
        .ok_or_else(|| format!("Course not found: {}", course_id))?;

    // Bundle export types
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CourseBundleExport {
        name: String,
        description: Option<String>,
        lessons: Vec<LessonExport>,
        decks: Vec<DeckExport>,
        quizzes: Vec<QuizExport>,
        exported_at: String,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct LessonExport {
        title: String,
        description: Option<String>,
        items: Vec<LessonItemExport>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct LessonItemExport {
        #[serde(rename = "type")]
        item_type: String,
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        requirement_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        requirement_value: Option<i32>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DeckExport {
        name: String,
        description: Option<String>,
        shuffle_cards: bool,
        cards: Vec<CardExport>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CardExport {
        front: String,
        back: String,
        front_type: String,
        back_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        front_language: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        back_language: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        notes: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        tags: Vec<String>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct QuizExport {
        name: String,
        description: Option<String>,
        shuffle_questions: bool,
        questions: Vec<QuestionExport>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct QuestionExport {
        #[serde(rename = "type")]
        question_type: String,
        content: String,
        content_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        content_language: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        correct_answer: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        choices: Vec<ChoiceExport>,
        multiple_answers: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        explanation: Option<String>,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        tags: Vec<String>,
    }

    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChoiceExport {
        text: String,
        is_correct: bool,
    }

    // Collect all deck and quiz IDs referenced in the course
    let mut deck_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut quiz_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for lesson in &course.lessons {
        for item in &lesson.items {
            if let Some(ref item_id) = item.item_id {
                match item.item_type {
                    db::LessonItemType::Deck => { deck_ids.insert(item_id.clone()); }
                    db::LessonItemType::Quiz => { quiz_ids.insert(item_id.clone()); }
                }
            }
        }
    }

    // Export all referenced decks
    let mut decks_export: Vec<DeckExport> = Vec::new();
    for deck_id in deck_ids {
        if let Some(deck) = db::get_deck(&conn, &active_user.id, &deck_id)? {
            let cards = db::get_cards_for_deck(&conn, &deck_id)?;
            decks_export.push(DeckExport {
                name: deck.name,
                description: deck.description,
                shuffle_cards: deck.shuffle_cards,
                cards: cards
                    .into_iter()
                    .map(|c| CardExport {
                        front: c.front,
                        back: c.back,
                        front_type: c.front_type,
                        back_type: c.back_type,
                        front_language: c.front_language,
                        back_language: c.back_language,
                        notes: c.notes,
                        tags: c.tags.into_iter().map(|t| t.name).collect(),
                    })
                    .collect(),
            });
        }
    }

    // Export all referenced quizzes
    let mut quizzes_export: Vec<QuizExport> = Vec::new();
    for quiz_id in quiz_ids {
        let quiz = db::get_quiz(&conn, &active_user.id, &quiz_id)?;
        quizzes_export.push(QuizExport {
            name: quiz.name,
            description: quiz.description,
            shuffle_questions: quiz.shuffle_questions,
            questions: quiz
                .questions
                .into_iter()
                .map(|q| QuestionExport {
                    question_type: match q.question_type {
                        db::QuestionType::MultipleChoice => "multiple_choice".to_string(),
                        db::QuestionType::FillInBlank => "fill_in_blank".to_string(),
                    },
                    content: q.content,
                    content_type: q.content_type,
                    content_language: q.content_language,
                    correct_answer: q.correct_answer,
                    choices: q
                        .choices
                        .into_iter()
                        .map(|c| ChoiceExport {
                            text: c.text,
                            is_correct: c.is_correct,
                        })
                        .collect(),
                    multiple_answers: q.multiple_answers,
                    explanation: q.explanation,
                    tags: q.tags.into_iter().map(|t| t.name).collect(),
                })
                .collect(),
        });
    }

    let export = CourseBundleExport {
        name: course.name,
        description: course.description,
        lessons: course
            .lessons
            .into_iter()
            .map(|lesson| LessonExport {
                title: lesson.title,
                description: lesson.description,
                items: lesson
                    .items
                    .into_iter()
                    .map(|item| LessonItemExport {
                        item_type: match item.item_type {
                            db::LessonItemType::Deck => "deck".to_string(),
                            db::LessonItemType::Quiz => "quiz".to_string(),
                        },
                        name: item.item_name,
                        requirement_type: item.requirement_type.map(|rt| match rt {
                            db::RequirementType::Study => "study".to_string(),
                            db::RequirementType::Review => "review".to_string(),
                            db::RequirementType::Complete => "complete".to_string(),
                            db::RequirementType::MinScore => "min_score".to_string(),
                        }),
                        requirement_value: item.requirement_value,
                    })
                    .collect(),
            })
            .collect(),
        decks: decks_export,
        quizzes: quizzes_export,
        exported_at: chrono::Utc::now().to_rfc3339(),
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("Failed to serialize: {}", e))
}
