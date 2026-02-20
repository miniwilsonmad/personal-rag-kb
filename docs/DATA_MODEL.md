# Data Model

## SQLite Schema

Each target has its own SQLite database. The schema is initialized by `initializeSchema()` in `src/database.ts`.

### `sources` Table

Stores metadata about ingested documents.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique source identifier |
| `url` | TEXT | NOT NULL UNIQUE | Original URL or file path |
| `normalized_url` | TEXT | NOT NULL UNIQUE | Normalized URL used for deduplication |
| `title` | TEXT | | Title of the document |
| `source_type` | TEXT | NOT NULL, CHECK IN ('article', 'video', 'pdf', 'text', 'tweet', 'reel', 'other') | Type of content |
| `summary` | TEXT | | Summary of the document (currently unused, reserved for future use) |
| `raw_content` | TEXT | | Full extracted text content |
| `content_hash` | TEXT | NOT NULL UNIQUE | Hash of content for integrity and deduplication |
| `tags` | TEXT | DEFAULT '[]' | JSON array of tag strings |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | When the source was ingested |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_sources_source_type` on `source_type`
- `idx_sources_content_hash` on `content_hash`
- `idx_sources_normalized_url` on `normalized_url`

### `chunks` Table

Stores text chunks and their relationship to sources.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique chunk identifier |
| `source_id` | INTEGER | NOT NULL, FK -> sources(id) ON DELETE CASCADE | Parent source |
| `chunk_index` | INTEGER | NOT NULL | Position of chunk within the source (0-based) |
| `content` | TEXT | NOT NULL | The actual text chunk |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | When the chunk was created |

**Indexes:**
- `idx_chunks_source_id` on `source_id`

### Database Settings

- **WAL mode** is enabled for better read/write concurrency.
- **Foreign key constraints** are enforced (`PRAGMA foreign_keys = ON`).
- Connections are cached in memory by absolute path to avoid duplicate handles.

## Vector Store (ChromaDB)

ChromaDB stores the vector embeddings for similarity search. Each target has its own collection.

### Collections

| Target | Collection Name |
|--------|----------------|
| pablo | `pablo_kb` |
| paloma | `paloma_kb` |
| reels | `reels_kb` |

### Vector ID Format

Each vector is identified by: `chunk_{source_id}_{chunk_id}`

Where `source_id` is the SQLite source ID and `chunk_id` is the SQLite chunk ID. This format ensures uniqueness even across database resets.

### Metadata Stored with Vectors

Each vector in ChromaDB carries the following metadata:

| Field | Type | Description |
|-------|------|-------------|
| `source_id` | number | Foreign key linking back to the SQLite `sources` table |
| `content` | string | The full text of the chunk (stored for retrieval context) |
| `url` | string | Original source URL/path |
| `title` | string | Document title |
| `tags` | string | Comma-separated list of tags (not JSON — ChromaDB metadata values must be scalar) |

### Batch Insertion

Vectors are inserted into ChromaDB in batches of 100 to avoid payload size limits.

## Relationship Between SQLite and ChromaDB

```
SQLite sources.id  ──1:N──>  SQLite chunks.id
                                    │
                                    │ (chunk ID embedded in vector ID)
                                    ▼
                             ChromaDB vector: chunk_{source_id}_{chunk_id}
```

SQLite is the source of truth for metadata (titles, URLs, tags, raw content). ChromaDB holds the vector embeddings and a copy of chunk content/metadata for retrieval. Deleting a source from SQLite cascades to its chunks, but ChromaDB vectors must be cleaned up separately.
