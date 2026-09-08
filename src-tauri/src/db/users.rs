use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{CreateUserRequest, LocalUser};

/// Get all users ordered by last login
pub fn get_all_users(conn: &Connection) -> Result<Vec<LocalUser>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, password_hash, avatar, created_at, last_login_at
             FROM users ORDER BY last_login_at DESC NULLS LAST, created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let users = stmt
        .query_map([], |row| {
            let password_hash: Option<String> = row.get(2)?;
            Ok(LocalUser {
                id: row.get(0)?,
                name: row.get(1)?,
                has_password: password_hash.is_some(),
                avatar: row.get(3)?,
                created_at: row.get(4)?,
                last_login_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query users: {}", e))?;

    users
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect users: {}", e))
}

/// Get a user by ID
pub fn get_user(conn: &Connection, id: &str) -> Result<LocalUser, String> {
    conn.query_row(
        "SELECT id, name, password_hash, avatar, created_at, last_login_at
         FROM users WHERE id = ?1",
        params![id],
        |row| {
            let password_hash: Option<String> = row.get(2)?;
            Ok(LocalUser {
                id: row.get(0)?,
                name: row.get(1)?,
                has_password: password_hash.is_some(),
                avatar: row.get(3)?,
                created_at: row.get(4)?,
                last_login_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| format!("User not found: {}", e))
}

/// Create a new user
pub fn create_user(conn: &Connection, request: &CreateUserRequest) -> Result<LocalUser, String> {
    // Input validation
    let name = request.name.trim();
    if name.is_empty() {
        return Err("User name cannot be empty".to_string());
    }
    if name.len() > 100 {
        return Err("User name cannot exceed 100 characters".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let avatar = request.avatar.as_deref().unwrap_or("avatar-smile");

    let password_hash = match &request.password {
        Some(p) => Some(hash_password(p)?),
        None => None,
    };

    conn.execute(
        "INSERT INTO users (id, name, password_hash, avatar, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, password_hash, avatar, now],
    )
    .map_err(|e| format!("Failed to create user: {}", e))?;

    get_user(conn, &id)
}

/// Verify a user's password (timing-safe using argon2)
pub fn verify_user_password(
    conn: &Connection,
    user_id: &str,
    password: Option<&str>,
) -> Result<bool, String> {
    let stored_hash: Option<String> = conn
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("User not found: {}", e))?;

    match (stored_hash, password) {
        (None, _) => Ok(true),
        (Some(_), None) => Ok(false),
        (Some(stored), Some(provided)) if is_argon2_hash(&stored) => {
            verify_password(provided, &stored)
        }
        // Legacy hash from v1.0.0. Verify against the old scheme, then
        // transparently upgrade so the next login takes the Argon2 path.
        (Some(stored), Some(provided)) => {
            if !verify_legacy_password(provided, &stored) {
                return Ok(false);
            }

            let upgraded = hash_password(provided)?;
            conn.execute(
                "UPDATE users SET password_hash = ?1 WHERE id = ?2",
                params![upgraded, user_id],
            )
            .map_err(|e| format!("Failed to upgrade password hash: {}", e))?;

            Ok(true)
        }
    }
}

/// Log in a user
pub fn login_user(
    conn: &Connection,
    user_id: &str,
    password: Option<&str>,
) -> Result<LocalUser, String> {
    if !verify_user_password(conn, user_id, password)? {
        return Err("Invalid password".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE users SET last_login_at = ?1 WHERE id = ?2",
        params![now, user_id],
    )
    .map_err(|e| format!("Failed to update login time: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_user_id', ?1)",
        params![user_id],
    )
    .map_err(|e| format!("Failed to set active user: {}", e))?;

    get_user(conn, user_id)
}

/// Get the currently active user
pub fn get_active_user(conn: &Connection) -> Result<Option<LocalUser>, String> {
    let user_id: Option<String> = conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'active_user_id'",
            [],
            |row| row.get(0),
        )
        .ok();

    match user_id {
        Some(id) => match get_user(conn, &id) {
            Ok(user) => Ok(Some(user)),
            Err(_) => Ok(None),
        },
        None => Ok(None),
    }
}

/// Log out the current user
pub fn logout_user(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM app_state WHERE key = 'active_user_id'", [])
        .map_err(|e| format!("Failed to logout: {}", e))?;
    Ok(())
}

/// Delete a user and their data
pub fn delete_user(conn: &Connection, user_id: &str) -> Result<(), String> {
    let active_user = get_active_user(conn)?;
    if let Some(active) = active_user {
        if active.id == user_id {
            logout_user(conn)?;
        }
    }

    // Delete decks owned by this user
    conn.execute("DELETE FROM decks WHERE user_id = ?1", params![user_id])
        .map_err(|e| format!("Failed to delete user decks: {}", e))?;

    // Delete quizzes owned by this user
    conn.execute("DELETE FROM quizzes WHERE user_id = ?1", params![user_id])
        .map_err(|e| format!("Failed to delete user quizzes: {}", e))?;

    // Delete the user
    conn.execute("DELETE FROM users WHERE id = ?1", params![user_id])
        .map_err(|e| format!("Failed to delete user: {}", e))?;

    Ok(())
}

/// Update a user's profile
pub fn update_user(
    conn: &Connection,
    user_id: &str,
    name: &str,
    password: Option<&str>,
    avatar: Option<&str>,
) -> Result<LocalUser, String> {
    let password_hash = match password {
        Some(p) => Some(hash_password(p)?),
        None => None,
    };

    match (password_hash, avatar) {
        (Some(hash), Some(av)) => conn.execute(
            "UPDATE users SET name = ?1, password_hash = ?2, avatar = ?3 WHERE id = ?4",
            params![name, hash, av, user_id],
        ),
        (Some(hash), None) => conn.execute(
            "UPDATE users SET name = ?1, password_hash = ?2 WHERE id = ?3",
            params![name, hash, user_id],
        ),
        (None, Some(av)) => conn.execute(
            "UPDATE users SET name = ?1, avatar = ?2 WHERE id = ?3",
            params![name, av, user_id],
        ),
        (None, None) => conn.execute(
            "UPDATE users SET name = ?1 WHERE id = ?2",
            params![name, user_id],
        ),
    }
    .map_err(|e| format!("Failed to update user: {}", e))?;

    get_user(conn, user_id)
}

/// Remove a user's password
pub fn remove_user_password(conn: &Connection, user_id: &str) -> Result<LocalUser, String> {
    conn.execute(
        "UPDATE users SET password_hash = NULL WHERE id = ?1",
        params![user_id],
    )
    .map_err(|e| format!("Failed to remove password: {}", e))?;

    get_user(conn, user_id)
}

/// Hash a password using Argon2 (cryptographically secure)
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();

    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Failed to hash password: {}", e))
}

/// Verify a password against an Argon2 hash (timing-safe)
fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed_hash =
        PasswordHash::new(hash).map_err(|e| format!("Invalid password hash: {}", e))?;

    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Whether a stored hash is Argon2 PHC format. Anything else predates
/// the move to Argon2 and must go through [`verify_legacy_password`].
fn is_argon2_hash(hash: &str) -> bool {
    hash.starts_with("$argon2")
}

/// Verify a password against a v1.0.0 hash, which was an unsalted 64-bit
/// DefaultHasher digest. Kept only so existing users can log in once more,
/// after which their hash is upgraded to Argon2.
fn verify_legacy_password(password: &str, hash: &str) -> bool {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    password.hash(&mut hasher);
    format!("{:x}", hasher.finish()) == hash
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hash a password the way v1.0.0 did, for exercising the upgrade path.
    fn legacy_hash(password: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        password.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    fn db_with_user(password_hash: Option<&str>) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password_hash TEXT,
                avatar TEXT NOT NULL DEFAULT 'avatar-smile',
                created_at TEXT NOT NULL,
                last_login_at TEXT
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, name, password_hash, created_at)
             VALUES ('u1', 'Test', ?1, '2026-01-01')",
            params![password_hash],
        )
        .unwrap();
        conn
    }

    fn stored_hash(conn: &Connection) -> Option<String> {
        conn.query_row("SELECT password_hash FROM users WHERE id = 'u1'", [], |r| {
            r.get(0)
        })
        .unwrap()
    }

    #[test]
    fn legacy_password_is_accepted_and_upgraded() {
        let conn = db_with_user(Some(&legacy_hash("hunter2")));

        assert!(verify_user_password(&conn, "u1", Some("hunter2")).unwrap());

        let upgraded = stored_hash(&conn).unwrap();
        assert!(is_argon2_hash(&upgraded), "hash should be upgraded in place");
        assert!(verify_user_password(&conn, "u1", Some("hunter2")).unwrap());
    }

    #[test]
    fn wrong_legacy_password_is_rejected_and_not_upgraded() {
        let original = legacy_hash("hunter2");
        let conn = db_with_user(Some(&original));

        assert!(!verify_user_password(&conn, "u1", Some("wrong")).unwrap());
        assert_eq!(stored_hash(&conn).as_deref(), Some(original.as_str()));
    }

    #[test]
    fn argon2_password_still_verifies() {
        let conn = db_with_user(Some(&hash_password("hunter2").unwrap()));

        assert!(verify_user_password(&conn, "u1", Some("hunter2")).unwrap());
        assert!(!verify_user_password(&conn, "u1", Some("wrong")).unwrap());
    }

    #[test]
    fn user_without_password_needs_none() {
        let conn = db_with_user(None);

        assert!(verify_user_password(&conn, "u1", None).unwrap());
    }
}
