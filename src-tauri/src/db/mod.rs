// Database module - organized into submodules by domain

pub mod course_content;
pub mod courses;
pub mod decks;
pub mod models;
pub mod seed;
pub mod notebooks;
pub mod quizzes;
pub mod state;
pub mod stats;
pub mod users;

// Re-export all public types and functions for convenient access
pub use models::*;
pub use state::{init_database, DbState};

// Deck operations
pub use decks::{
    add_tag_to_card, create_card, create_deck, create_tag, delete_card, delete_deck, delete_tag,
    get_all_decks, get_card, get_cards_for_deck, get_deck, get_tag_by_name,
    get_tags_for_card, get_tags_for_deck, remove_tag_from_card, toggle_deck_favorite,
    update_card, update_deck,
};

// Course operations
pub use courses::{
    create_course, delete_course, get_all_courses, get_course, get_course_items_overview,
    get_course_with_lessons, toggle_course_favorite, update_course,
};

// Course-owned content operations
pub use course_content::{
    adopt_course_deck, adopt_course_page, adopt_course_quiz, copy_deck_to_course,
    copy_page_to_course, copy_quiz_to_course, create_course_deck, create_course_notebook,
    create_course_page, create_course_quiz, delete_course_deck, delete_course_notebook,
    delete_course_quiz, get_course_cards, get_course_deck, get_course_page, get_course_quiz,
    grade_course_quiz,
};

// Lesson operations
pub use courses::{
    add_lesson_item, clear_lesson_item_progress, create_lesson, delete_lesson, get_lesson,
    get_lesson_items, get_lesson_progress, get_lessons, link_lesson_items_by_name,
    record_lesson_progress, remove_lesson_item, reorder_lesson_items, reorder_lessons,
    reset_course_progress, update_lesson, update_lesson_item_reference,
};

// User operations
pub use users::{
    create_user, delete_user, get_active_user, get_all_users, get_user, login_user, logout_user,
    remove_user_password, update_user,
};

// Quiz operations
pub use quizzes::{
    add_tag_to_question, create_question, create_quiz, create_quiz_tag, delete_question,
    delete_quiz, delete_quiz_tag, get_all_quizzes, get_question, get_questions_for_quiz, get_quiz,
    get_quiz_tag_by_name, get_tags_for_question, get_tags_for_quiz,
    remove_tag_from_question, reorder_questions, toggle_quiz_favorite,
    update_choices_for_question, update_question, update_quiz,
};

// Statistics operations
pub use stats::{
    end_study_session, get_deck_study_stats, get_quiz_attempt, get_quiz_attempts, get_quiz_stats,
    start_quiz_attempt, start_study_session, submit_quiz_attempt,
};

// Notebook operations
pub use notebooks::{
    create_notebook, create_page, delete_notebook, delete_page, duplicate_page, get_all_notebooks,
    get_all_page_titles, get_backlinks, get_notebook, get_page, get_pages_for_notebook,
    get_recent_pages, move_page, reorder_pages, search_pages, toggle_notebook_favorite,
    toggle_page_pin, update_notebook, update_page,
};
