import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#1d4ed8',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY,
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      labels TEXT NOT NULL DEFAULT '[]',
      checklist TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE TABLE IF NOT EXISTS board_members (
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (board_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_board_members_user ON board_members(user_id);
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      stored_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_card ON attachments(card_id);
    -- Files whose rows were deleted (directly or via card/list/board/account cascades) are queued
    -- here and removed from disk by purgeDeletedFiles().
    CREATE TABLE IF NOT EXISTS file_trash (stored_name TEXT PRIMARY KEY);
    CREATE TRIGGER IF NOT EXISTS trg_attachments_trash AFTER DELETE ON attachments
      BEGIN INSERT OR IGNORE INTO file_trash (stored_name) VALUES (OLD.stored_name); END;
    CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
    CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(list_id, position);
  `);
  // Migration: sessions issued before this time (ms) are rejected (set when the password changes).
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('password_changed_at')) db.exec('ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0');
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
