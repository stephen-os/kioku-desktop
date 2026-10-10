use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Database state wrapper for Tauri state management
pub struct DbState(pub Mutex<Connection>);

/// Get the path to the SQLite database file
pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_data).map_err(|e| format!("Failed to create dir: {}", e))?;

    Ok(app_data.join("kioku.db"))
}

/// Initialize the database connection and schema
pub fn init_database(app: &AppHandle) -> Result<Connection, String> {
    let path = get_db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| format!("Failed to open database: {}", e))?;

    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    // Initialize schema
    let schema = include_str!("../../migrations/schema.sql");
    conn.execute_batch(schema)
        .map_err(|e| format!("Failed to initialize database schema: {}", e))?;

    // Additive migration for databases created before a column existed (there is
    // no versioned-migration system). ADD COLUMN errors with "duplicate column
    // name" once applied, which we deliberately ignore so this stays idempotent.
    let _ = conn.execute("ALTER TABLE cards ADD COLUMN tts_lang TEXT", []);

    Ok(conn)
}
