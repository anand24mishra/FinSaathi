import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config';

// Versioned migrations. Append only; never edit a shipped migration.
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pw_salt TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  profile TEXT NOT NULL,
  push_token TEXT,
  push_platform TEXT,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
CREATE TABLE holdings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  symbol TEXT,
  scheme_code INTEGER,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  avg_price REAL NOT NULL,
  buy_date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_holdings_user ON holdings(user_id);
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  pushed INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX idx_alerts_user ON alerts(user_id, created_at DESC);
`,
  },
  {
    version: 2,
    sql: `
CREATE TABLE telegram_links (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL
);
CREATE TABLE telegram_link_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tg_codes_user ON telegram_link_codes(user_id);
`,
  },
];

let _db: DatabaseSync | null = null;
const stmtCache = new Map<string, StatementSync>();

export function openDb(file: string = config.dbPath): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM schema_migrations').get() as { v: number };
  for (const m of MIGRATIONS) {
    if (m.version <= row.v) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Singleton handle. Call initDb() once at startup (server/tests). */
export function initDb(file?: string): DatabaseSync {
  if (_db) closeDb();
  _db = openDb(file);
  return _db;
}
export function getDb(): DatabaseSync {
  if (!_db) _db = openDb();
  return _db;
}
export function closeDb(): void {
  stmtCache.clear();
  try { _db?.close(); } catch { /* ignore */ }
  _db = null;
}
/** Prepared-statement cache. */
export function stmt(sql: string): StatementSync {
  let s = stmtCache.get(sql);
  if (!s) { s = getDb().prepare(sql); stmtCache.set(sql, s); }
  return s;
}
export function dbHealthy(): boolean {
  try { stmt('SELECT 1 AS x').get(); return true; } catch { return false; }
}
