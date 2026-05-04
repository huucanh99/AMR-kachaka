'use strict';

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../kachaka.db');

const db = new DatabaseSync(DB_PATH);

// WAL = faster writes; foreign_keys = enforce FK constraints
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// SQL compatibility shims — translate pg-style SQL → SQLite
// ---------------------------------------------------------------------------
function convertSql(sql) {
  return sql
    .replace(/\$\d+/g, '?')                        // $1,$2,... → ?
    .replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');   // NOW() → CURRENT_TIMESTAMP
}

// ---------------------------------------------------------------------------
// pg-compatible pool interface
// All methods return Promises so the service layer stays unchanged.
// ---------------------------------------------------------------------------
const pool = {
  /**
   * Execute one SQL statement.
   * Returns { rows: [...] } for SELECT / RETURNING, { rows: [] } otherwise.
   */
  query(sql, params = []) {
    try {
      const converted = convertSql(sql);
      const stmt = db.prepare(converted);
      const isRead = /^\s*SELECT/i.test(sql.trim()) || /\bRETURNING\b/i.test(sql);

      if (isRead) {
        // stmt.all() accepts positional args spread or a single array
        const rows = params.length ? stmt.all(...params) : stmt.all();
        return Promise.resolve({ rows });
      } else {
        params.length ? stmt.run(...params) : stmt.run();
        return Promise.resolve({ rows: [] });
      }
    } catch (err) {
      return Promise.reject(err);
    }
  },

  /**
   * Returns a lightweight "client" for running explicit transactions.
   * BEGIN / COMMIT / ROLLBACK are plain SQL strings passed to query().
   * release() is a no-op (SQLite has one shared connection).
   */
  connect() {
    const client = {
      query: (sql, params = []) => pool.query(sql, params),
      release() {},
    };
    return Promise.resolve(client);
  },

  /** No-op — prevents crashes on pool.on('error', ...) calls. */
  on() {},
};

// ---------------------------------------------------------------------------
// Schema bootstrap — runs every startup, safe due to IF NOT EXISTS guards
// ---------------------------------------------------------------------------
async function initDb() {
  // db.exec() handles multiple statements at once
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_tasks (
      id            INTEGER  PRIMARY KEY,
      location_id   TEXT     NOT NULL,
      location_name TEXT,
      command_id    TEXT,
      status        TEXT     NOT NULL DEFAULT 'pending',
      paused_at     TEXT,
      created_at    TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS robot_events (
      id         INTEGER  PRIMARY KEY,
      event_type TEXT     NOT NULL,
      payload    TEXT,
      created_at TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shelf_layers (
      id         INTEGER  PRIMARY KEY,
      shelf_id   TEXT     NOT NULL,
      layer      INTEGER  NOT NULL CHECK (layer >= 1),
      status     TEXT     NOT NULL DEFAULT 'active',
      max_weight REAL     NOT NULL DEFAULT 5.0,
      updated_at TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT shelf_layers_unique UNIQUE (shelf_id, layer)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id                   INTEGER  PRIMARY KEY,
      pickup_location_id   TEXT     NOT NULL,
      destination_id       TEXT     NOT NULL,
      shelf_id             TEXT,
      shelf_layer          INTEGER,
      verification_code    TEXT,
      receiver_name        TEXT     NOT NULL,
      status               TEXT     NOT NULL DEFAULT 'waiting',
      pickup_verified_at   TEXT,
      delivery_verified_at TEXT,
      cancelled_at         TEXT,
      created_at           TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT tasks_shelf_fk
        FOREIGN KEY (shelf_id, shelf_layer)
        REFERENCES shelf_layers (shelf_id, layer) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS task_timeline (
      id         INTEGER  PRIMARY KEY,
      task_id    INTEGER  NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status     TEXT     NOT NULL,
      note       TEXT,
      created_at TEXT     NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS task_timeline_task_id_idx
      ON task_timeline (task_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY,
      username   TEXT    NOT NULL UNIQUE,
      email      TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'operator',
      created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('pickup_timeout_seconds',   '30');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('delivery_timeout_seconds', '30');
  `);

  // Migration: add max_weight if existing DB was created before this column existed
  try {
    db.exec('ALTER TABLE shelf_layers ADD COLUMN max_weight REAL NOT NULL DEFAULT 5.0');
  } catch (_) { /* column already exists — ignore */ }

  // Migration: make users.email nullable (was NOT NULL UNIQUE)
  try {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (schema && schema.sql.includes('email      TEXT    NOT NULL')) {
      db.exec(`
        CREATE TABLE users_new (
          id         INTEGER PRIMARY KEY,
          username   TEXT    NOT NULL UNIQUE,
          email      TEXT    UNIQUE,
          password   TEXT    NOT NULL,
          role       TEXT    NOT NULL DEFAULT 'operator',
          created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_new SELECT id, username, email, password, role, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    }
  } catch (_) { /* migration already applied */ }

  console.log('[DB] SQLite ready →', DB_PATH);
}

module.exports = { pool, initDb };
