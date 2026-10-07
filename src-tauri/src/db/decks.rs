use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{Card, CardTag, CreateCardRequest, Deck, Tag, UpdateCardRequest};

// ============================================
// Deck Operations
// ============================================

pub fn create_deck(
    conn: &Connection,
    user_id: &str,
    name: &str,
    description: Option<&str>,
    shuffle_cards: bool,
) -> Result<Deck, String> {
    // Input validation
    let name = name.trim();
    if name.is_empty() {
        return Err("Deck name cannot be empty".to_string());
    }
    if name.len() > 255 {
        return Err("Deck name cannot exceed 255 characters".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO decks (id, user_id, name, description, shuffle_cards, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, user_id, name, description, shuffle_cards as i32, now, now],
    )
    .map_err(|e| format!("Failed to create deck: {}", e))?;

    get_deck(conn, user_id, &id)?
        .ok_or_else(|| "Failed to retrieve created deck".to_string())
}

pub fn get_all_decks(conn: &Connection, user_id: &str) -> Result<Vec<Deck>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.name, d.description, d.shuffle_cards,
                    d.created_at, d.updated_at,
                    (SELECT COUNT(*) FROM cards WHERE deck_id = d.id) as card_count,
                    (SELECT COUNT(*) FROM deck_favorites WHERE deck_id = d.id AND user_id = ?1) as is_fav
             FROM decks d WHERE d.user_id = ?1 ORDER BY d.updated_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let decks = stmt
        .query_map(params![user_id], |row| {
            Ok(Deck {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                shuffle_cards: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                card_count: Some(row.get(6)?),
                is_favorite: Some(row.get::<_, i32>(7)? > 0),
            })
        })
        .map_err(|e| format!("Failed to query decks: {}", e))?;

    decks
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect decks: {}", e))
}

/// SECURITY: owner-scoped read. Only returns the deck when it belongs to
/// `user_id`; a deck owned by another local user reads as `None` (not found),
/// matching the default-deny posture of `delete_deck`.
pub fn get_deck(conn: &Connection, user_id: &str, id: &str) -> Result<Option<Deck>, String> {
    match conn.query_row(
        "SELECT id, name, description, shuffle_cards, created_at, updated_at
         FROM decks WHERE id = ?1 AND user_id = ?2",
        params![id, user_id],
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
    ) {
        Ok(deck) => Ok(Some(deck)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Database error: {}", e)),
    }
}

/// SECURITY: owner-scoped update. The WHERE clause is scoped to `user_id` so a
/// user cannot edit another local user's deck; zero rows affected is rejected.
pub fn update_deck(
    conn: &Connection,
    user_id: &str,
    id: &str,
    name: &str,
    description: Option<&str>,
    shuffle_cards: bool,
) -> Result<Deck, String> {
    let now = chrono::Utc::now().to_rfc3339();

    let rows_affected = conn
        .execute(
            "UPDATE decks SET name = ?1, description = ?2, shuffle_cards = ?3, updated_at = ?4
             WHERE id = ?5 AND user_id = ?6",
            params![name, description, shuffle_cards as i32, now, id, user_id],
        )
        .map_err(|e| format!("Failed to update deck: {}", e))?;

    if rows_affected == 0 {
        return Err("Deck not found or access denied".to_string());
    }

    get_deck(conn, user_id, id)?
        .ok_or_else(|| format!("Deck not found after update: {}", id))
}

pub fn delete_deck(conn: &Connection, user_id: &str, id: &str) -> Result<(), String> {
    let rows_affected = conn
        .execute(
            "DELETE FROM decks WHERE id = ?1 AND user_id = ?2",
            params![id, user_id],
        )
        .map_err(|e| format!("Failed to delete deck: {}", e))?;

    if rows_affected == 0 {
        return Err("Deck not found or access denied".to_string());
    }
    Ok(())
}

// ============================================
// Card Operations
// ============================================

pub fn create_card(
    conn: &Connection,
    deck_id: &str,
    request: &CreateCardRequest,
) -> Result<Card, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let front_type = request.front_type.as_deref().unwrap_or("TEXT");
    let back_type = request.back_type.as_deref().unwrap_or("TEXT");

    conn.execute(
        "INSERT INTO cards (id, deck_id, front, front_type, front_language,
         back, back_type, back_language, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id, deck_id, request.front, front_type, request.front_language,
            request.back, back_type, request.back_language, request.notes, now, now
        ],
    )
    .map_err(|e| format!("Failed to create card: {}", e))?;
    get_card(conn, &id, deck_id)
}

pub fn get_cards_for_deck(conn: &Connection, deck_id: &str) -> Result<Vec<Card>, String> {
    use std::collections::HashMap;

    // Query 1: Get all cards for the deck
    let mut stmt = conn
        .prepare(
            "SELECT id, deck_id, front, front_type, front_language,
                    back, back_type, back_language, notes,
                    created_at, updated_at
             FROM cards WHERE deck_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let mut cards: Vec<Card> = stmt
        .query_map(params![deck_id], |row| {
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
                tags: vec![],
            })
        })
        .map_err(|e| format!("Failed to query cards: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect cards: {}", e))?;

    // Query 2: Get all tags for all cards in this deck (single query instead of N queries)
    let mut tags_stmt = conn
        .prepare(
            "SELECT ct.card_id, t.id, t.name
             FROM card_tags ct
             INNER JOIN tags t ON t.id = ct.tag_id
             INNER JOIN cards c ON c.id = ct.card_id
             WHERE c.deck_id = ?1
             ORDER BY t.name",
        )
        .map_err(|e| format!("Failed to prepare tags query: {}", e))?;

    let mut tags_by_card: HashMap<String, Vec<CardTag>> = HashMap::new();
    let tags_iter = tags_stmt
        .query_map(params![deck_id], |row| {
            Ok((
                row.get::<_, String>(0)?, // card_id
                CardTag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                },
            ))
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?;

    for tag_result in tags_iter {
        let (card_id, tag) = tag_result.map_err(|e| format!("Failed to read tag: {}", e))?;
        tags_by_card.entry(card_id).or_default().push(tag);
    }

    // Assign tags to cards
    for card in &mut cards {
        if let Some(tags) = tags_by_card.remove(&card.id) {
            card.tags = tags;
        }
    }

    Ok(cards)
}

pub fn get_card(conn: &Connection, id: &str, deck_id: &str) -> Result<Card, String> {
    let mut card = conn
        .query_row(
            "SELECT id, deck_id, front, front_type, front_language,
                    back, back_type, back_language, notes,
                    created_at, updated_at
             FROM cards WHERE id = ?1 AND deck_id = ?2",
            params![id, deck_id],
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
                    tags: vec![],
                })
            },
        )
        .map_err(|e| format!("Card not found: {}", e))?;

    card.tags = get_tags_for_card(conn, &card.id)?;
    Ok(card)
}

pub fn update_card(
    conn: &Connection,
    id: &str,
    deck_id: &str,
    request: &UpdateCardRequest,
) -> Result<Card, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let front_type = request.front_type.as_deref().unwrap_or("TEXT");
    let back_type = request.back_type.as_deref().unwrap_or("TEXT");

    conn.execute(
        "UPDATE cards SET front = ?1, front_type = ?2, front_language = ?3,
         back = ?4, back_type = ?5, back_language = ?6, notes = ?7, updated_at = ?8
         WHERE id = ?9 AND deck_id = ?10",
        params![
            request.front, front_type, request.front_language,
            request.back, back_type, request.back_language, request.notes, now, id, deck_id
        ],
    )
    .map_err(|e| format!("Failed to update card: {}", e))?;
    get_card(conn, id, deck_id)
}

pub fn delete_card(conn: &Connection, id: &str, deck_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM cards WHERE id = ?1 AND deck_id = ?2",
        params![id, deck_id],
    )
    .map_err(|e| format!("Failed to delete card: {}", e))?;
    Ok(())
}

// ============================================
// Tag Operations
// ============================================

pub fn create_tag(conn: &Connection, deck_id: &str, name: &str) -> Result<Tag, String> {
    let id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO tags (id, deck_id, name) VALUES (?1, ?2, ?3)",
        params![id, deck_id, name],
    )
    .map_err(|e| format!("Failed to create tag: {}", e))?;

    Ok(Tag {
        id,
        deck_id: deck_id.to_string(),
        name: name.to_string(),
    })
}

pub fn get_tags_for_deck(conn: &Connection, deck_id: &str) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare("SELECT id, deck_id, name FROM tags WHERE deck_id = ?1 ORDER BY name")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags = stmt
        .query_map(params![deck_id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?;

    tags.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tags: {}", e))
}

pub fn get_tags_for_card(conn: &Connection, card_id: &str) -> Result<Vec<CardTag>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.name FROM tags t
             INNER JOIN card_tags ct ON t.id = ct.tag_id
             WHERE ct.card_id = ?1 ORDER BY t.name",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags = stmt
        .query_map(params![card_id], |row| {
            Ok(CardTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?;

    tags.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tags: {}", e))
}

pub fn delete_tag(conn: &Connection, deck_id: &str, id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM tags WHERE id = ?1 AND deck_id = ?2",
        params![id, deck_id],
    )
    .map_err(|e| format!("Failed to delete tag: {}", e))?;
    Ok(())
}

pub fn add_tag_to_card(
    conn: &Connection,
    deck_id: &str,
    card_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    // Verify card belongs to the deck
    let card_deck_id: String = conn
        .query_row(
            "SELECT deck_id FROM cards WHERE id = ?1",
            params![card_id],
            |row| row.get(0),
        )
        .map_err(|_| "Card not found".to_string())?;

    if card_deck_id != deck_id {
        return Err("Card does not belong to this deck".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?1, ?2)",
        params![card_id, tag_id],
    )
    .map_err(|e| format!("Failed to add tag to card: {}", e))?;
    Ok(())
}

pub fn remove_tag_from_card(
    conn: &Connection,
    deck_id: &str,
    card_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    // Verify card belongs to the deck
    let card_deck_id: String = conn
        .query_row(
            "SELECT deck_id FROM cards WHERE id = ?1",
            params![card_id],
            |row| row.get(0),
        )
        .map_err(|_| "Card not found".to_string())?;

    if card_deck_id != deck_id {
        return Err("Card does not belong to this deck".to_string());
    }

    conn.execute(
        "DELETE FROM card_tags WHERE card_id = ?1 AND tag_id = ?2",
        params![card_id, tag_id],
    )
    .map_err(|e| format!("Failed to remove tag from card: {}", e))?;
    Ok(())
}

pub fn get_tag_by_name(conn: &Connection, deck_id: &str, name: &str) -> Result<Option<Tag>, String> {
    match conn.query_row(
        "SELECT id, deck_id, name FROM tags WHERE deck_id = ?1 AND name = ?2",
        params![deck_id, name],
        |row| {
            Ok(Tag {
                id: row.get(0)?,
                deck_id: row.get(1)?,
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
// Favorite Operations
// ============================================

pub fn add_deck_favorite(conn: &Connection, user_id: &str, deck_id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO deck_favorites (user_id, deck_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, deck_id, now],
    )
    .map_err(|e| format!("Failed to add favorite: {}", e))?;
    Ok(())
}

pub fn remove_deck_favorite(conn: &Connection, user_id: &str, deck_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM deck_favorites WHERE user_id = ?1 AND deck_id = ?2",
        params![user_id, deck_id],
    )
    .map_err(|e| format!("Failed to remove favorite: {}", e))?;
    Ok(())
}

pub fn is_deck_favorite(conn: &Connection, user_id: &str, deck_id: &str) -> Result<bool, String> {
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM deck_favorites WHERE user_id = ?1 AND deck_id = ?2",
            params![user_id, deck_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to check favorite: {}", e))?;
    Ok(count > 0)
}

pub fn toggle_deck_favorite(conn: &Connection, user_id: &str, deck_id: &str) -> Result<bool, String> {
    if is_deck_favorite(conn, user_id, deck_id)? {
        remove_deck_favorite(conn, user_id, deck_id)?;
        Ok(false)
    } else {
        add_deck_favorite(conn, user_id, deck_id)?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// In-memory DB with just the `decks` columns the owner-scoping touches.
    fn db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE decks (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                name TEXT NOT NULL,
                description TEXT,
                shuffle_cards INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn get_deck_is_owner_scoped() {
        let conn = db();
        let deck = create_deck(&conn, "owner", "Mine", None, false).unwrap();

        assert!(get_deck(&conn, "owner", &deck.id).unwrap().is_some());
        // A different local user cannot read it.
        assert!(get_deck(&conn, "attacker", &deck.id).unwrap().is_none());
    }

    #[test]
    fn update_deck_rejects_non_owner() {
        let conn = db();
        let deck = create_deck(&conn, "owner", "Mine", None, false).unwrap();

        let err = update_deck(&conn, "attacker", &deck.id, "Pwned", None, false)
            .expect_err("non-owner update must be denied");
        assert!(err.contains("access denied") || err.contains("not found"));

        // The row is untouched.
        let still = get_deck(&conn, "owner", &deck.id).unwrap().unwrap();
        assert_eq!(still.name, "Mine");

        // The owner can still update their own deck.
        let updated = update_deck(&conn, "owner", &deck.id, "Renamed", None, false).unwrap();
        assert_eq!(updated.name, "Renamed");
    }
}
