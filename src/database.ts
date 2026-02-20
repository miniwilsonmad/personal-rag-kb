
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

// Cache connections to avoid opening multiple handles to the same DB
const dbConnections = new Map<string, Database>();

export async function getDbConnection(dbPath: string): Promise<Database> {
  // Resolve absolute path to ensure cache hits
  const absolutePath = path.resolve(dbPath);

  if (dbConnections.has(absolutePath)) {
    return dbConnections.get(absolutePath)!;
  }

  const sqlite = sqlite3.verbose();
  const db = await open({
    filename: absolutePath,
    driver: sqlite.Database
  });

  // Enable WAL mode for better concurrency
  await db.exec('PRAGMA journal_mode = WAL;');
  // Enforce foreign key constraints
  await db.exec('PRAGMA foreign_keys = ON;');

  console.error(`Database connection established: ${absolutePath}`);
  dbConnections.set(absolutePath, db);
  return db;
}

export async function initializeSchema(dbPath: string): Promise<void> {
  const db = await getDbConnection(dbPath);

  const createSourcesTable = `
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      normalized_url TEXT NOT NULL UNIQUE,
      title TEXT,
      source_type TEXT NOT NULL CHECK(source_type IN ('article', 'video', 'pdf', 'text', 'tweet', 'reel', 'other')),
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
  await db.exec(createChunksTable);
  await db.exec(createIndexes);
  console.error(`Schema initialized for ${dbPath}`);
}

export async function getAllUniqueTags(dbPath: string): Promise<string[]> {
    const db = await getDbConnection(dbPath);
    const rows = await db.all('SELECT tags FROM sources');
    const allTags = new Set<string>();
    
    rows.forEach(row => {
      try {
        const tags = JSON.parse(row.tags);
        if (Array.isArray(tags)) {
          tags.forEach(t => allTags.add(t));
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });
    
    return Array.from(allTags);
}
