// Course-owned content: decks/cards, quizzes/questions/choices, and notebook
// pages that belong to a course (separate from the personal library). Rows load
// into the SAME model structs as library content (Deck/Card/Quiz/Question/
// Choice/Page) so the study, quiz, and notes engines work on them unchanged.

use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{
    Card, Choice, CreateCardRequest, CreateChoiceRequest, CreateQuestionRequest, Deck, Page,
    Question, QuestionAnswer, QuestionResult, QuestionType, Quiz, QuizAttempt, UpdateCardRequest,
    UpdateDeckRequest, UpdatePageRequest, UpdateQuestionRequest, UpdateQuizRequest,
};

// ============================================
// Decks & Cards (read)
// ============================================

pub fn get_course_deck(conn: &Connection, id: &str) -> Result<Deck, String> {
    conn.query_row(
        "SELECT id, name, description, shuffle_cards, created_at, updated_at
         FROM course_decks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Deck {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                shuffle_cards: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                card_count: None,
                is_favorite: None,
            })
        },
    )
    .map_err(|e| format!("Course deck not found: {}", e))
}

pub fn get_course_cards(conn: &Connection, course_deck_id: &str) -> Result<Vec<Card>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_deck_id, front, front_type, front_language,
                    back, back_type, back_language, notes,
                    created_at, updated_at, front_tts_lang, back_tts_lang
             FROM course_cards WHERE course_deck_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let cards = stmt
        .query_map(params![course_deck_id], |row| {
            Ok(Card {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                front: row.get(2)?,
                front_type: row.get(3)?,
                front_language: row.get(4)?,
                back: row.get(5)?,
                back_type: row.get(6)?,
                back_language: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                front_tts_lang: row.get(11)?,
                back_tts_lang: row.get(12)?,
                tags: vec![],
            })
        })
        .map_err(|e| format!("Failed to query course cards: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course cards: {}", e))?;

    Ok(cards)
}

pub fn get_course_card(conn: &Connection, id: &str) -> Result<Card, String> {
    conn.query_row(
        "SELECT id, course_deck_id, front, front_type, front_language,
                back, back_type, back_language, notes,
                created_at, updated_at, front_tts_lang, back_tts_lang
         FROM course_cards WHERE id = ?1",
        params![id],
        |row| {
            Ok(Card {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                front: row.get(2)?,
                front_type: row.get(3)?,
                front_language: row.get(4)?,
                back: row.get(5)?,
                back_type: row.get(6)?,
                back_language: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                front_tts_lang: row.get(11)?,
                back_tts_lang: row.get(12)?,
                tags: vec![],
            })
        },
    )
    .map_err(|e| format!("Course card not found: {}", e))
}

// ============================================
// Quizzes, Questions & Choices (read)
// ============================================

pub fn get_course_quiz(conn: &Connection, id: &str) -> Result<Quiz, String> {
    let mut quiz = conn
        .query_row(
            "SELECT id, name, description, shuffle_questions, created_at, updated_at
             FROM course_quizzes WHERE id = ?1",
            params![id],
            |row| {
                Ok(Quiz {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    shuffle_questions: row.get::<_, i32>(3)? != 0,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    questions: vec![],
                    question_count: None,
                    is_favorite: None,
                })
            },
        )
        .map_err(|e| format!("Course quiz not found: {}", e))?;

    quiz.questions = get_course_questions(conn, id)?;
    Ok(quiz)
}

fn get_course_questions(conn: &Connection, course_quiz_id: &str) -> Result<Vec<Question>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_quiz_id, question_type, content, content_type, content_language,
                    correct_answer, multiple_answers, explanation, position, created_at, updated_at
             FROM course_questions WHERE course_quiz_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let questions = stmt
        .query_map(params![course_quiz_id], |row| {
            Ok(Question {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                question_type: QuestionType::from_str(&row.get::<_, String>(2)?),
                content: row.get(3)?,
                content_type: row.get(4)?,
                content_language: row.get(5)?,
                correct_answer: row.get(6)?,
                multiple_answers: row.get::<_, i32>(7)? != 0,
                explanation: row.get(8)?,
                position: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                choices: vec![],
                tags: vec![],
            })
        })
        .map_err(|e| format!("Failed to query course questions: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course questions: {}", e))?;

    let mut out = Vec::new();
    for q in questions {
        let choices = get_course_choices(conn, &q.id)?;
        out.push(Question { choices, ..q });
    }
    Ok(out)
}

pub fn get_course_question(conn: &Connection, id: &str) -> Result<Question, String> {
    let question = conn
        .query_row(
            "SELECT id, course_quiz_id, question_type, content, content_type, content_language,
                    correct_answer, multiple_answers, explanation, position, created_at, updated_at
             FROM course_questions WHERE id = ?1",
            params![id],
            |row| {
                Ok(Question {
                    id: row.get(0)?,
                    quiz_id: row.get(1)?,
                    question_type: QuestionType::from_str(&row.get::<_, String>(2)?),
                    content: row.get(3)?,
                    content_type: row.get(4)?,
                    content_language: row.get(5)?,
                    correct_answer: row.get(6)?,
                    multiple_answers: row.get::<_, i32>(7)? != 0,
                    explanation: row.get(8)?,
                    position: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    choices: vec![],
                    tags: vec![],
                })
            },
        )
        .map_err(|e| format!("Course question not found: {}", e))?;

    let choices = get_course_choices(conn, id)?;
    Ok(Question { choices, ..question })
}

fn get_course_choices(conn: &Connection, course_question_id: &str) -> Result<Vec<Choice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_question_id, text, is_correct, position
             FROM course_choices WHERE course_question_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let choices = stmt
        .query_map(params![course_question_id], |row| {
            Ok(Choice {
                id: row.get(0)?,
                question_id: row.get(1)?,
                text: row.get(2)?,
                is_correct: row.get::<_, i32>(3)? != 0,
                position: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query course choices: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course choices: {}", e))?;

    Ok(choices)
}

// ============================================
// Notebook pages (read)
// ============================================

pub fn get_course_page(conn: &Connection, id: &str) -> Result<Page, String> {
    conn.query_row(
        "SELECT id, course_notebook_id, title, content, position, created_at, updated_at
         FROM course_pages WHERE id = ?1",
        params![id],
        |row| {
            Ok(Page {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                position: row.get(4)?,
                is_pinned: false,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Course page not found: {}", e))
}

// ============================================
// Create (authoring / reseed)
// ============================================

pub fn create_course_deck(
    conn: &Connection,
    course_id: &str,
    name: &str,
    description: Option<&str>,
    shuffle_cards: bool,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_decks (id, course_id, name, description, shuffle_cards, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, course_id, name, description, shuffle_cards as i32, now],
    )
    .map_err(|e| format!("Failed to create course deck: {}", e))?;
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
pub fn create_course_card(
    conn: &Connection,
    course_deck_id: &str,
    front: &str,
    front_type: &str,
    front_language: Option<&str>,
    back: &str,
    back_type: &str,
    back_language: Option<&str>,
    notes: Option<&str>,
    front_tts_lang: Option<&str>,
    back_tts_lang: Option<&str>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_cards (id, course_deck_id, front, front_type, front_language,
            back, back_type, back_language, notes, front_tts_lang, back_tts_lang, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        params![
            id, course_deck_id, front, front_type, front_language,
            back, back_type, back_language, notes, front_tts_lang, back_tts_lang, now
        ],
    )
    .map_err(|e| format!("Failed to create course card: {}", e))?;
    Ok(id)
}

pub fn create_course_quiz(
    conn: &Connection,
    course_id: &str,
    name: &str,
    description: Option<&str>,
    shuffle_questions: bool,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_quizzes (id, course_id, name, description, shuffle_questions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, course_id, name, description, shuffle_questions as i32, now],
    )
    .map_err(|e| format!("Failed to create course quiz: {}", e))?;
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
pub fn create_course_question(
    conn: &Connection,
    course_quiz_id: &str,
    question_type: &str,
    content: &str,
    content_type: &str,
    content_language: Option<&str>,
    correct_answer: Option<&str>,
    multiple_answers: bool,
    explanation: Option<&str>,
    position: i32,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_questions (id, course_quiz_id, question_type, content, content_type,
            content_language, correct_answer, multiple_answers, explanation, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
        params![
            id, course_quiz_id, question_type, content, content_type,
            content_language, correct_answer, multiple_answers as i32, explanation, position, now
        ],
    )
    .map_err(|e| format!("Failed to create course question: {}", e))?;
    Ok(id)
}

pub fn create_course_choice(
    conn: &Connection,
    course_question_id: &str,
    text: &str,
    is_correct: bool,
    position: i32,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO course_choices (id, course_question_id, text, is_correct, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, course_question_id, text, is_correct as i32, position],
    )
    .map_err(|e| format!("Failed to create course choice: {}", e))?;
    Ok(id)
}

pub fn create_course_notebook(
    conn: &Connection,
    course_id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_notebooks (id, course_id, name, description, icon, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'notebook', NULL, ?5, ?5)",
        params![id, course_id, name, description, now],
    )
    .map_err(|e| format!("Failed to create course notebook: {}", e))?;
    Ok(id)
}

pub fn create_course_page(
    conn: &Connection,
    course_notebook_id: &str,
    title: &str,
    content: &str,
    position: i32,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO course_pages (id, course_notebook_id, title, content, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, course_notebook_id, title, content, position, now],
    )
    .map_err(|e| format!("Failed to create course page: {}", e))?;
    Ok(id)
}

// ============================================
// Copy library content INTO a course (authoring: "copy from library")
// ============================================

pub fn copy_deck_to_course(
    conn: &Connection,
    course_id: &str,
    deck_id: &str,
) -> Result<String, String> {
    let (name, description, shuffle): (String, Option<String>, i32) = conn
        .query_row(
            "SELECT name, description, shuffle_cards FROM decks WHERE id = ?1",
            params![deck_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("Library deck not found: {}", e))?;

    let new_deck = create_course_deck(conn, course_id, &name, description.as_deref(), shuffle != 0)?;

    let cards = super::decks::get_cards_for_deck(conn, deck_id)?;
    for c in cards {
        create_course_card(
            conn,
            &new_deck,
            &c.front,
            &c.front_type,
            c.front_language.as_deref(),
            &c.back,
            &c.back_type,
            c.back_language.as_deref(),
            c.notes.as_deref(),
            c.front_tts_lang.as_deref(),
            c.back_tts_lang.as_deref(),
        )?;
    }
    Ok(new_deck)
}

pub fn copy_quiz_to_course(
    conn: &Connection,
    course_id: &str,
    quiz_id: &str,
) -> Result<String, String> {
    let (name, description, shuffle): (String, Option<String>, i32) = conn
        .query_row(
            "SELECT name, description, shuffle_questions FROM quizzes WHERE id = ?1",
            params![quiz_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("Library quiz not found: {}", e))?;

    let new_quiz = create_course_quiz(conn, course_id, &name, description.as_deref(), shuffle != 0)?;

    let questions = super::quizzes::get_questions_for_quiz(conn, quiz_id)?;
    for q in questions {
        let new_q = create_course_question(
            conn,
            &new_quiz,
            q.question_type.as_str(),
            &q.content,
            &q.content_type,
            q.content_language.as_deref(),
            q.correct_answer.as_deref(),
            q.multiple_answers,
            q.explanation.as_deref(),
            q.position,
        )?;
        for ch in q.choices {
            create_course_choice(conn, &new_q, &ch.text, ch.is_correct, ch.position)?;
        }
    }
    Ok(new_quiz)
}

/// Copy a library page into the course as a standalone note (its own notebook).
pub fn copy_page_to_course(
    conn: &Connection,
    course_id: &str,
    page_id: &str,
) -> Result<String, String> {
    let (title, content): (String, String) = conn
        .query_row(
            "SELECT title, content FROM pages WHERE id = ?1",
            params![page_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Library page not found: {}", e))?;

    let notebook = create_course_notebook(conn, course_id, &title, None)?;
    create_course_page(conn, &notebook, &title, &content, 0)
}

// ============================================
// Adopt: copy course-owned content OUT to the personal library
// ============================================

pub fn adopt_course_deck(
    conn: &Connection,
    user_id: &str,
    course_deck_id: &str,
) -> Result<String, String> {
    let deck = get_course_deck(conn, course_deck_id)?;
    let cards = get_course_cards(conn, course_deck_id)?;

    let new_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO decks (id, user_id, name, description, shuffle_cards, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![new_id, user_id, deck.name, deck.description, deck.shuffle_cards as i32, now],
    )
    .map_err(|e| format!("Failed to adopt deck: {}", e))?;

    for c in cards {
        let card_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO cards (id, deck_id, front, front_type, front_language, back, back_type,
                back_language, notes, front_tts_lang, back_tts_lang, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            params![
                card_id, new_id, c.front, c.front_type, c.front_language, c.back, c.back_type,
                c.back_language, c.notes, c.front_tts_lang, c.back_tts_lang, now
            ],
        )
        .map_err(|e| format!("Failed to adopt card: {}", e))?;
    }
    Ok(new_id)
}

pub fn adopt_course_quiz(
    conn: &Connection,
    user_id: &str,
    course_quiz_id: &str,
) -> Result<String, String> {
    let quiz = get_course_quiz(conn, course_quiz_id)?;

    let new_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO quizzes (id, user_id, name, description, shuffle_questions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![new_id, user_id, quiz.name, quiz.description, quiz.shuffle_questions as i32, now],
    )
    .map_err(|e| format!("Failed to adopt quiz: {}", e))?;

    for q in quiz.questions {
        let qid = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO questions (id, quiz_id, question_type, content, content_type, content_language,
                correct_answer, multiple_answers, explanation, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                qid, new_id, q.question_type.as_str(), q.content, q.content_type, q.content_language,
                q.correct_answer, q.multiple_answers as i32, q.explanation, q.position, now
            ],
        )
        .map_err(|e| format!("Failed to adopt question: {}", e))?;
        for ch in q.choices {
            let cid = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO choices (id, question_id, text, is_correct, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![cid, qid, ch.text, ch.is_correct as i32, ch.position],
            )
            .map_err(|e| format!("Failed to adopt choice: {}", e))?;
        }
    }
    Ok(new_id)
}

/// Adopt a course page into a new personal notebook holding that single page.
pub fn adopt_course_page(
    conn: &Connection,
    user_id: &str,
    course_page_id: &str,
) -> Result<String, String> {
    let page = get_course_page(conn, course_page_id)?;

    let nb_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notebooks (id, user_id, name, description, icon, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, NULL, 'notebook', NULL, ?4, ?4)",
        params![nb_id, user_id, page.title, now],
    )
    .map_err(|e| format!("Failed to adopt note: {}", e))?;

    let page_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO pages (id, notebook_id, title, content, position, is_pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?5)",
        params![page_id, nb_id, page.title, page.content, now],
    )
    .map_err(|e| format!("Failed to adopt note page: {}", e))?;
    Ok(nb_id)
}

// ============================================
// Delete course-owned content (removing a lesson item's content / editing)
// ============================================

pub fn delete_course_deck(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM course_decks WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete course deck: {}", e))?;
    Ok(())
}

pub fn delete_course_quiz(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM course_quizzes WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete course quiz: {}", e))?;
    Ok(())
}

pub fn delete_course_notebook(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM course_notebooks WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete course notebook: {}", e))?;
    Ok(())
}

pub fn delete_course_card(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM course_cards WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete course card: {}", e))?;
    Ok(())
}

pub fn delete_course_question(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM course_questions WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete course question: {}", e))?;
    Ok(())
}

// ============================================
// Update course-owned content in place (Edit-course mode). These take the same
// request DTOs as the library editors so DeckEdit/QuizEditor/CourseNoteView can
// reuse their forms against course content.
// ============================================

pub fn update_course_deck(
    conn: &Connection,
    id: &str,
    request: &UpdateDeckRequest,
) -> Result<Deck, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE course_decks SET name = ?1, description = ?2, shuffle_cards = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            request.name,
            request.description,
            request.shuffle_cards.unwrap_or(false) as i32,
            now,
            id
        ],
    )
    .map_err(|e| format!("Failed to update course deck: {}", e))?;
    get_course_deck(conn, id)
}

pub fn create_course_card_from_request(
    conn: &Connection,
    course_deck_id: &str,
    request: &CreateCardRequest,
) -> Result<Card, String> {
    let id = create_course_card(
        conn,
        course_deck_id,
        &request.front,
        request.front_type.as_deref().unwrap_or("TEXT"),
        request.front_language.as_deref(),
        &request.back,
        request.back_type.as_deref().unwrap_or("TEXT"),
        request.back_language.as_deref(),
        request.notes.as_deref(),
        request.front_tts_lang.as_deref(),
        request.back_tts_lang.as_deref(),
    )?;
    get_course_card(conn, &id)
}

pub fn update_course_card(
    conn: &Connection,
    id: &str,
    request: &UpdateCardRequest,
) -> Result<Card, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE course_cards SET front = ?1, front_type = ?2, front_language = ?3,
         back = ?4, back_type = ?5, back_language = ?6, notes = ?7,
         front_tts_lang = ?8, back_tts_lang = ?9, updated_at = ?10 WHERE id = ?11",
        params![
            request.front,
            request.front_type.as_deref().unwrap_or("TEXT"),
            request.front_language,
            request.back,
            request.back_type.as_deref().unwrap_or("TEXT"),
            request.back_language,
            request.notes,
            request.front_tts_lang,
            request.back_tts_lang,
            now,
            id
        ],
    )
    .map_err(|e| format!("Failed to update course card: {}", e))?;
    get_course_card(conn, id)
}

pub fn update_course_quiz(
    conn: &Connection,
    id: &str,
    request: &UpdateQuizRequest,
) -> Result<Quiz, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE course_quizzes SET name = ?1, description = ?2, shuffle_questions = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            request.name,
            request.description,
            request.shuffle_questions.unwrap_or(false) as i32,
            now,
            id
        ],
    )
    .map_err(|e| format!("Failed to update course quiz: {}", e))?;
    get_course_quiz(conn, id)
}

pub fn create_course_question_from_request(
    conn: &Connection,
    course_quiz_id: &str,
    request: &CreateQuestionRequest,
) -> Result<Question, String> {
    let position: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM course_questions WHERE course_quiz_id = ?1",
            params![course_quiz_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let id = create_course_question(
        conn,
        course_quiz_id,
        &request.question_type,
        &request.content,
        request.content_type.as_deref().unwrap_or("TEXT"),
        request.content_language.as_deref(),
        request.correct_answer.as_deref(),
        request.multiple_answers.unwrap_or(false),
        request.explanation.as_deref(),
        position,
    )?;

    if let Some(choices) = &request.choices {
        for (idx, choice) in choices.iter().enumerate() {
            create_course_choice(conn, &id, &choice.text, choice.is_correct, idx as i32)?;
        }
    }
    get_course_question(conn, &id)
}

pub fn update_course_question(
    conn: &Connection,
    id: &str,
    request: &UpdateQuestionRequest,
) -> Result<Question, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE course_questions SET question_type = ?1, content = ?2, content_type = ?3,
         content_language = ?4, correct_answer = ?5, multiple_answers = ?6,
         explanation = ?7, updated_at = ?8 WHERE id = ?9",
        params![
            request.question_type,
            request.content,
            request.content_type.as_deref().unwrap_or("TEXT"),
            request.content_language,
            request.correct_answer,
            request.multiple_answers.unwrap_or(false) as i32,
            request.explanation,
            now,
            id
        ],
    )
    .map_err(|e| format!("Failed to update course question: {}", e))?;
    get_course_question(conn, id)
}

pub fn update_course_choices_for_question(
    conn: &Connection,
    course_question_id: &str,
    choices: &[CreateChoiceRequest],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM course_choices WHERE course_question_id = ?1",
        params![course_question_id],
    )
    .map_err(|e| format!("Failed to delete old course choices: {}", e))?;

    for (idx, choice) in choices.iter().enumerate() {
        create_course_choice(conn, course_question_id, &choice.text, choice.is_correct, idx as i32)?;
    }
    Ok(())
}

pub fn reorder_course_questions(
    conn: &Connection,
    course_quiz_id: &str,
    question_ids: &[String],
) -> Result<(), String> {
    for (idx, qid) in question_ids.iter().enumerate() {
        conn.execute(
            "UPDATE course_questions SET position = ?1 WHERE id = ?2 AND course_quiz_id = ?3",
            params![idx as i32, qid, course_quiz_id],
        )
        .map_err(|e| format!("Failed to reorder course question: {}", e))?;
    }
    Ok(())
}

pub fn update_course_page(
    conn: &Connection,
    id: &str,
    request: &UpdatePageRequest,
) -> Result<Page, String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE course_pages SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![request.title, request.content, now, id],
    )
    .map_err(|e| format!("Failed to update course page: {}", e))?;
    get_course_page(conn, id)
}

// ============================================
// Grading (course quizzes aren't in quiz_attempts; grade in-memory and return a
// QuizAttempt-shaped result the existing results screen can render)
// ============================================

pub fn grade_course_quiz(
    conn: &Connection,
    course_quiz_id: &str,
    answers: &[QuestionAnswer],
) -> Result<QuizAttempt, String> {
    let quiz = get_course_quiz(conn, course_quiz_id)?;
    let total = quiz.questions.len() as i32;
    let now = chrono::Utc::now().to_rfc3339();

    let mut correct = 0;
    let mut results = Vec::new();
    for a in answers {
        let is_correct = grade_course_answer(conn, &a.question_id, &a.answer)?;
        if is_correct {
            correct += 1;
        }
        results.push(QuestionResult {
            id: Uuid::new_v4().to_string(),
            attempt_id: String::new(),
            question_id: a.question_id.clone(),
            user_answer: Some(a.answer.clone()),
            is_correct,
        });
    }

    let score = if total > 0 {
        ((correct as f64 / total as f64) * 100.0).round() as i32
    } else {
        0
    };

    Ok(QuizAttempt {
        id: String::new(),
        quiz_id: course_quiz_id.to_string(),
        started_at: now.clone(),
        completed_at: Some(now),
        duration_seconds: None,
        total_questions: total,
        correct_answers: correct,
        score_percentage: score,
        question_results: results,
    })
}

fn grade_course_answer(
    conn: &Connection,
    course_question_id: &str,
    user_answer: &str,
) -> Result<bool, String> {
    let (question_type, correct_answer): (String, Option<String>) = conn
        .query_row(
            "SELECT question_type, correct_answer FROM course_questions WHERE id = ?1",
            params![course_question_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Course question not found: {}", e))?;

    match question_type.as_str() {
        "fill_in_blank" => {
            let user_trimmed = user_answer.trim().to_lowercase();
            let correct_trimmed = correct_answer.as_deref().map(|s| s.trim().to_lowercase());
            Ok(correct_trimmed.as_deref() == Some(user_trimmed.as_str()))
        }
        "multiple_choice" => {
            let mut stmt = conn
                .prepare("SELECT id FROM course_choices WHERE course_question_id = ?1 AND is_correct = 1")
                .map_err(|e| format!("Failed to prepare query: {}", e))?;
            let correct_ids: Vec<String> = stmt
                .query_map(params![course_question_id], |row| row.get(0))
                .map_err(|e| format!("Failed to query choices: {}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect choices: {}", e))?;

            let mut user_ids: Vec<&str> = user_answer
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            user_ids.sort();
            let mut correct_sorted = correct_ids.clone();
            correct_sorted.sort();

            Ok(user_ids == correct_sorted.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        }
        _ => Ok(false),
    }
}
