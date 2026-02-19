
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

import { config } from './config';

const DB_PATH = config.dbPath;

let db: Database | null = null;

export async function getDbConnection(): Promise<Database> {
  if (db) {
    return db;
  }

  const sqlite = sqlite3.verbose();
  db = await open({
    filename: DB_PATH,
    driver: sqlite.Database
  });

  // Enable WAL mode for better concurrency
  await db.exec('PRAGMA journal_mode = WAL;');
  // Enforce foreign key constraints
  await db.exec('PRAGMA foreign_keys = ON;');

  console.log('Database connection established.');
  return db;
}

export async function initializeSchema(): Promise<void> {
  const db = await getDbConnection();

  const createSourcesTable = `
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      normalized_url TEXT NOT NULL UNIQUE,
      title TEXT,
      source_type TEXT NOT NULL CHECK(source_type IN ('article', 'video', 'pdf', 'text', 'tweet', 'other')),
      summary TEXT,
      raw_content TEXT,
      content_hash TEXT NOT NULL UNIQUE,
      tags TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createChunksTable = `
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      embedding_dim INTEGER,
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding BLOB,
      embedding_dim INTEGER,
      embedding_provider TEXT,
      embedding_model TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );
  `;

  const createIndexes = `
    CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_sources_source_type ON sources(source_type);
    CREATE INDEX IF NOT EXISTS idx_sources_content_hash ON sources(content_hash);
    CREATE INDEX IF NOT EXISTS idx_sources_normalized_url ON sources(normalized_url);
  `;

  await db.exec(createSourcesTable);
  console.log('"sources" table created or already exists.');
  await db.exec(createChunksTable);
  console.log('"chunks" table created or already exists.');
  await db.exec(createIndexes);
  console.log('Database indexes created or already exist.');
}

// Ensure schema is initialized on first import
(async () => {
  try {
    await initializeSchema();
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exit(1);
  }
})();
