use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{
    Choice, CreateChoiceRequest, CreateQuestionRequest, CreateQuizRequest, Question, QuestionTag,
    QuestionType, Quiz, QuizTag, UpdateQuestionRequest, UpdateQuizRequest,
};

// ============================================
// Quiz Operations
// ============================================

pub fn create_quiz(conn: &Connection, user_id: &str, request: &CreateQuizRequest) -> Result<Quiz, String> {
    // Input validation
    let name = request.name.trim();
    if name.is_empty() {
        return Err("Quiz name cannot be empty".to_string());
    }
    if name.len() > 255 {
        return Err("Quiz name cannot exceed 255 characters".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let shuffle = request.shuffle_questions.unwrap_or(false);

    conn.execute(
        "INSERT INTO quizzes (id, user_id, name, description, shuffle_questions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, user_id, name, request.description, shuffle as i32, now, now],
    )
    .map_err(|e| format!("Failed to create quiz: {}", e))?;

    get_quiz(conn, user_id, &id)
}

/// SECURITY: owner-scoped read. Only returns the quiz when it belongs to
/// `user_id`; a quiz owned by another local user is reported as "not found",
/// matching the default-deny posture of `delete_quiz`.
pub fn get_quiz(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<Quiz, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, shuffle_questions, created_at, updated_at
             FROM quizzes WHERE id = ?1 AND user_id = ?2",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let quiz = stmt
        .query_row(params![quiz_id, user_id], |row| {
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
        })
        .map_err(|e| format!("Quiz not found: {}", e))?;

    let questions = get_questions_for_quiz(conn, quiz_id)?;
    let count = questions.len() as i32;

    Ok(Quiz {
        questions,
        question_count: Some(count),
        ..quiz
    })
}

pub fn get_all_quizzes(conn: &Connection, user_id: &str) -> Result<Vec<Quiz>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT q.id, q.name, q.description, q.shuffle_questions,
                    q.created_at, q.updated_at,
                    (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
                    CASE WHEN qf.quiz_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
             FROM quizzes q
             LEFT JOIN quiz_favorites qf ON q.id = qf.quiz_id AND qf.user_id = ?1
             WHERE q.user_id = ?1
             ORDER BY q.created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let quizzes = stmt
        .query_map(params![user_id], |row| {
            Ok(Quiz {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                shuffle_questions: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                questions: vec![],
                question_count: Some(row.get(6)?),
                is_favorite: Some(row.get::<_, i32>(7)? != 0),
            })
        })
        .map_err(|e| format!("Failed to query quizzes: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect quizzes: {}", e))?;

    Ok(quizzes)
}

/// SECURITY: owner-scoped update. The WHERE clause is scoped to `user_id` so a
/// user cannot edit another local user's quiz; zero rows affected is rejected.
pub fn update_quiz(
    conn: &Connection,
    user_id: &str,
    quiz_id: &str,
    request: &UpdateQuizRequest,
) -> Result<Quiz, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let shuffle = request.shuffle_questions.unwrap_or(false);

    let rows_affected = conn
        .execute(
            "UPDATE quizzes SET name = ?1, description = ?2, shuffle_questions = ?3, updated_at = ?4
             WHERE id = ?5 AND user_id = ?6",
            params![request.name, request.description, shuffle as i32, now, quiz_id, user_id],
        )
        .map_err(|e| format!("Failed to update quiz: {}", e))?;

    if rows_affected == 0 {
        return Err("Quiz not found or access denied".to_string());
    }

    get_quiz(conn, user_id, quiz_id)
}

pub fn delete_quiz(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<(), String> {
    let rows_affected = conn
        .execute(
            "DELETE FROM quizzes WHERE id = ?1 AND user_id = ?2",
            params![quiz_id, user_id],
        )
        .map_err(|e| format!("Failed to delete quiz: {}", e))?;

    if rows_affected == 0 {
        return Err("Quiz not found or access denied".to_string());
    }
    Ok(())
}

// ============================================
// Question Operations
// ============================================

pub fn create_question(
    conn: &Connection,
    quiz_id: &str,
    request: &CreateQuestionRequest,
) -> Result<Question, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Get next position
    let position: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM questions WHERE quiz_id = ?1",
            params![quiz_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let content_type = request.content_type.as_deref().unwrap_or("TEXT");
    let multiple_answers = request.multiple_answers.unwrap_or(false);

    conn.execute(
        "INSERT INTO questions (id, quiz_id, question_type, content, content_type,
         content_language, correct_answer, multiple_answers, explanation, position,
         created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id,
            quiz_id,
            request.question_type,
            request.content,
            content_type,
            request.content_language,
            request.correct_answer,
            multiple_answers as i32,
            request.explanation,
            position,
            now,
            now
        ],
    )
    .map_err(|e| format!("Failed to create question: {}", e))?;

    // Create choices if provided
    if let Some(choices) = &request.choices {
        for (idx, choice) in choices.iter().enumerate() {
            create_choice(conn, &id, choice, idx as i32)?;
        }
    }

    get_question(conn, &id)
}

pub fn get_question(conn: &Connection, question_id: &str) -> Result<Question, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, quiz_id, question_type, content, content_type, content_language,
             correct_answer, multiple_answers, explanation, position, created_at, updated_at
             FROM questions WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let question = stmt
        .query_row(params![question_id], |row| {
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
        .map_err(|e| format!("Question not found: {}", e))?;

    let choices = get_choices_for_question(conn, question_id)?;
    let tags = get_tags_for_question(conn, question_id)?;

    Ok(Question {
        choices,
        tags,
        ..question
    })
}

pub fn get_questions_for_quiz(conn: &Connection, quiz_id: &str) -> Result<Vec<Question>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, quiz_id, question_type, content, content_type, content_language,
             correct_answer, multiple_answers, explanation, position, created_at, updated_at
             FROM questions WHERE quiz_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let questions = stmt
        .query_map(params![quiz_id], |row| {
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
        .map_err(|e| format!("Failed to query questions: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect questions: {}", e))?;

    // Load choices and tags for each question
    let mut questions_with_data = Vec::new();
    for q in questions {
        let choices = get_choices_for_question(conn, &q.id)?;
        let tags = get_tags_for_question(conn, &q.id)?;
        questions_with_data.push(Question { choices, tags, ..q });
    }

    Ok(questions_with_data)
}

pub fn update_question(
    conn: &Connection,
    question_id: &str,
    request: &UpdateQuestionRequest,
) -> Result<Question, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let content_type = request.content_type.as_deref().unwrap_or("TEXT");
    let multiple_answers = request.multiple_answers.unwrap_or(false);

    conn.execute(
        "UPDATE questions SET question_type = ?1, content = ?2, content_type = ?3,
         content_language = ?4, correct_answer = ?5, multiple_answers = ?6,
         explanation = ?7, updated_at = ?8 WHERE id = ?9",
        params![
            request.question_type,
            request.content,
            content_type,
            request.content_language,
            request.correct_answer,
            multiple_answers as i32,
            request.explanation,
            now,
            question_id
        ],
    )
    .map_err(|e| format!("Failed to update question: {}", e))?;

    get_question(conn, question_id)
}

pub fn delete_question(conn: &Connection, question_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM questions WHERE id = ?1", params![question_id])
        .map_err(|e| format!("Failed to delete question: {}", e))?;
    Ok(())
}

pub fn reorder_questions(
    conn: &Connection,
    quiz_id: &str,
    question_ids: &[String],
) -> Result<(), String> {
    // Begin transaction for atomic reordering
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<(), String> {
        for (idx, qid) in question_ids.iter().enumerate() {
            conn.execute(
                "UPDATE questions SET position = ?1 WHERE id = ?2 AND quiz_id = ?3",
                params![idx as i32, qid, quiz_id],
            )
            .map_err(|e| format!("Failed to reorder question: {}", e))?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
            Ok(())
        }
        Err(e) => {
            if let Err(rollback_err) = conn.execute("ROLLBACK", []) {
                eprintln!("Warning: Failed to rollback transaction: {}", rollback_err);
            }
            Err(e)
        }
    }
}

// ============================================
// Choice Operations
// ============================================

pub fn create_choice(
    conn: &Connection,
    question_id: &str,
    request: &CreateChoiceRequest,
    position: i32,
) -> Result<Choice, String> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO choices (id, question_id, text, is_correct, position)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, question_id, request.text, request.is_correct as i32, position],
    )
    .map_err(|e| format!("Failed to create choice: {}", e))?;

    Ok(Choice {
        id,
        question_id: question_id.to_string(),
        text: request.text.clone(),
        is_correct: request.is_correct,
        position,
    })
}

pub fn get_choices_for_question(conn: &Connection, question_id: &str) -> Result<Vec<Choice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, question_id, text, is_correct, position
             FROM choices WHERE question_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let choices = stmt
        .query_map(params![question_id], |row| {
            Ok(Choice {
                id: row.get(0)?,
                question_id: row.get(1)?,
                text: row.get(2)?,
                is_correct: row.get::<_, i32>(3)? != 0,
                position: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query choices: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect choices: {}", e))?;

    Ok(choices)
}

pub fn update_choices_for_question(
    conn: &Connection,
    question_id: &str,
    choices: &[CreateChoiceRequest],
) -> Result<(), String> {
    // Delete existing choices
    conn.execute(
        "DELETE FROM choices WHERE question_id = ?1",
        params![question_id],
    )
    .map_err(|e| format!("Failed to delete old choices: {}", e))?;

    // Create new choices
    for (idx, choice) in choices.iter().enumerate() {
        create_choice(conn, question_id, choice, idx as i32)?;
    }

    Ok(())
}

// ============================================
// Quiz Tag Operations
// ============================================

pub fn create_quiz_tag(conn: &Connection, quiz_id: &str, name: &str) -> Result<QuizTag, String> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO quiz_tags (id, quiz_id, name) VALUES (?1, ?2, ?3)",
        params![id, quiz_id, name],
    )
    .map_err(|e| format!("Failed to create quiz tag: {}", e))?;

    Ok(QuizTag {
        id,
        quiz_id: quiz_id.to_string(),
        name: name.to_string(),
    })
}

pub fn get_tags_for_quiz(conn: &Connection, quiz_id: &str) -> Result<Vec<QuizTag>, String> {
    let mut stmt = conn
        .prepare("SELECT id, quiz_id, name FROM quiz_tags WHERE quiz_id = ?1 ORDER BY name")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags = stmt
        .query_map(params![quiz_id], |row| {
            Ok(QuizTag {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query quiz tags: {}", e))?;

    tags.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect quiz tags: {}", e))
}

pub fn get_tags_for_question(conn: &Connection, question_id: &str) -> Result<Vec<QuestionTag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name FROM quiz_tags t
             INNER JOIN question_tags qt ON t.id = qt.tag_id
             WHERE qt.question_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags = stmt
        .query_map(params![question_id], |row| {
            Ok(QuestionTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query question tags: {}", e))?;

    tags.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect question tags: {}", e))
}

pub fn delete_quiz_tag(conn: &Connection, quiz_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM quiz_tags WHERE id = ?1 AND quiz_id = ?2",
        params![tag_id, quiz_id],
    )
    .map_err(|e| format!("Failed to delete quiz tag: {}", e))?;
    Ok(())
}

pub fn add_tag_to_question(conn: &Connection, question_id: &str, tag_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?1, ?2)",
        params![question_id, tag_id],
    )
    .map_err(|e| format!("Failed to add tag to question: {}", e))?;
    Ok(())
}

pub fn remove_tag_from_question(
    conn: &Connection,
    question_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM question_tags WHERE question_id = ?1 AND tag_id = ?2",
        params![question_id, tag_id],
    )
    .map_err(|e| format!("Failed to remove tag from question: {}", e))?;
    Ok(())
}

pub fn get_quiz_tag_by_name(
    conn: &Connection,
    quiz_id: &str,
    name: &str,
) -> Result<Option<QuizTag>, String> {
    match conn.query_row(
        "SELECT id, quiz_id, name FROM quiz_tags WHERE quiz_id = ?1 AND name = ?2",
        params![quiz_id, name],
        |row| {
            Ok(QuizTag {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                name: row.get(2)?,
            })
        },
    ) {
        Ok(tag) => Ok(Some(tag)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Query failed: {}", e)),
    }
}

// ============================================
// Quiz Favorites Operations
// ============================================

pub fn add_quiz_favorite(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO quiz_favorites (user_id, quiz_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, quiz_id, now],
    )
    .map_err(|e| format!("Failed to add quiz favorite: {}", e))?;
    Ok(())
}

pub fn remove_quiz_favorite(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM quiz_favorites WHERE user_id = ?1 AND quiz_id = ?2",
        params![user_id, quiz_id],
    )
    .map_err(|e| format!("Failed to remove quiz favorite: {}", e))?;
    Ok(())
}

pub fn is_quiz_favorite(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<bool, String> {
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM quiz_favorites WHERE user_id = ?1 AND quiz_id = ?2",
            params![user_id, quiz_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check quiz favorite: {}", e))?;
    Ok(count > 0)
}

pub fn toggle_quiz_favorite(conn: &Connection, user_id: &str, quiz_id: &str) -> Result<bool, String> {
    if is_quiz_favorite(conn, user_id, quiz_id)? {
        remove_quiz_favorite(conn, user_id, quiz_id)?;
        Ok(false)
    } else {
        add_quiz_favorite(conn, user_id, quiz_id)?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// In-memory DB with the quiz tables `get_quiz` reads (questions/choices/
    /// tags stay empty; owner-scoping lives on the `quizzes` row).
    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE quizzes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                shuffle_questions INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE questions (
                id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, question_type TEXT NOT NULL,
                content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'TEXT',
                content_language TEXT, correct_answer TEXT,
                multiple_answers INTEGER NOT NULL DEFAULT 0, explanation TEXT,
                position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE choices (
                id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT NOT NULL,
                is_correct INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE quiz_tags (
                id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, name TEXT NOT NULL
            );
            CREATE TABLE question_tags (
                question_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (question_id, tag_id)
            );",
        )
        .unwrap();
        conn
    }

    fn new_quiz(name: &str) -> CreateQuizRequest {
        CreateQuizRequest {
            name: name.to_string(),
            description: None,
            shuffle_questions: Some(false),
        }
    }

    #[test]
    fn get_quiz_is_owner_scoped() {
        let conn = db();
        let quiz = create_quiz(&conn, "owner", &new_quiz("Mine")).unwrap();

        assert!(get_quiz(&conn, "owner", &quiz.id).is_ok());
        // A different local user is told it does not exist.
        assert!(get_quiz(&conn, "attacker", &quiz.id).is_err());
    }

    #[test]
    fn update_quiz_rejects_non_owner() {
        let conn = db();
        let quiz = create_quiz(&conn, "owner", &new_quiz("Mine")).unwrap();

        let req = UpdateQuizRequest {
            name: "Pwned".to_string(),
            description: None,
            shuffle_questions: Some(false),
        };
        let err = update_quiz(&conn, "attacker", &quiz.id, &req)
            .expect_err("non-owner update must be denied");
        assert!(err.contains("access denied") || err.contains("not found"));

        // The row is untouched and the owner can still edit it.
        assert_eq!(get_quiz(&conn, "owner", &quiz.id).unwrap().name, "Mine");
        let ok = UpdateQuizRequest {
            name: "Renamed".to_string(),
            description: None,
            shuffle_questions: Some(false),
        };
        assert_eq!(update_quiz(&conn, "owner", &quiz.id, &ok).unwrap().name, "Renamed");
    }
}
