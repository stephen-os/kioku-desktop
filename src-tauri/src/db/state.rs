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

    // Additive migrations for databases created before a column existed (there is
    // no versioned-migration system). ADD COLUMN errors with "duplicate column
    // name" once applied, which we deliberately ignore so this stays idempotent.
    let _ = conn.execute("ALTER TABLE cards ADD COLUMN front_tts_lang TEXT", []);
    let _ = conn.execute("ALTER TABLE cards ADD COLUMN back_tts_lang TEXT", []);
    // Carry over the earlier single per-card spoken-language column (if this DB
    // has it) into both sides. The UPDATEs no-op (error, ignored) on DBs that
    // never had `tts_lang`.
    let _ = conn.execute(
        "UPDATE cards SET front_tts_lang = tts_lang WHERE front_tts_lang IS NULL AND tts_lang IS NOT NULL",
        [],
    );
    let _ = conn.execute(
        "UPDATE cards SET back_tts_lang = tts_lang WHERE back_tts_lang IS NULL AND tts_lang IS NOT NULL",
        [],
    );

    Ok(conn)
}
