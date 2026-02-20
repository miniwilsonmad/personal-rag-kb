# Ingestion Pipeline

This document walks through the full ingestion flow implemented in `src/ingest.ts`.

## Overview

```
User runs: npm start -- ingest <source> --tags "a,b" --targets "pablo,reels"
                                │
                                ▼
                    ┌───────────────────────┐
                    │  1. Acquire lock       │
                    │  2. Extract content    │  ← runs once
                    │  3. Classify (auto-tag)│  ← runs once
                    │  4. Chunk & embed      │  ← runs once
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  For each target:      │
                    │  5. Dedup check        │
                    │  6. SQLite insert (tx) │
                    │  7. ChromaDB insert    │
                    │  8. File archival      │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  9. Release lock       │
                    └───────────────────────┘
```

## Step-by-Step

### 1. Lock Acquisition

Before any work begins, `createLock()` writes the current process PID to `ingest.lock` (located at the project root, resolved via `__dirname/../`).

**Stale lock detection** (`isLockStale()`):
- If the lock file is older than **15 minutes**, it's considered stale.
- If the PID in the lock file is no longer a running process (checked via `process.kill(pid, 0)`), it's considered stale.
- Stale locks are overwritten. Non-stale locks cause the process to throw and exit.

The lock is always released in the `finally` block, even if ingestion fails.

### 2. Content Extraction

`ingestFromSource(source)` in `src/extractor.ts` is called with the raw source string (URL or file path).

**Expected return value:**
```typescript
{
  title: string;           // Document title
  content: string;         // Extracted text content
  originalContent: string; // Raw/original content (for archival)
  sourceType: string;      // 'article' | 'video' | 'pdf' | 'text' | 'tweet' | 'reel' | 'other'
  fileExtension: string;   // e.g., '.txt', '.html', '.pdf'
  source: string;          // Original source URL/path
  normalizedSource: string;// Normalized for dedup (e.g., stripped query params)
  contentHash: string;     // Hash of content for integrity
}
```

> **Current state**: The extractor is a stub that returns hardcoded test data. See [Known Limitations](./KNOWN_LIMITATIONS.md).

If extraction returns falsy, ingestion halts immediately.

### 3. Content Classification

`classifyContent(content, existingTags)` in `src/classifier.ts` sends the first 5000 characters of the extracted content to the LLM along with all existing tags from the database.

The LLM returns a JSON object:
```json
{
  "tags": ["existing_tag", "new_tag"],
  "newTags": ["new_tag"],
  "reasoning": "This content is about..."
}
```

The returned tags are **merged** with any tags the user provided via `--tags`, deduplicated with a `Set`.

Existing tags are fetched from the `reels` target database by default (falling back to the first specified target).

### 4. Chunking and Embedding

This step runs once and produces data reused across all targets.

1. `chunkContent(content)` splits the extracted text into chunks (~800 chars with 200 char overlap). See [Chunking & Embeddings](./CHUNKING_AND_EMBEDDINGS.md) for algorithm details.
2. `embedChunks(chunks)` generates vector embeddings for each chunk via the LLM provider. Results are cached in an LRU cache.

If zero chunks are successfully embedded, ingestion halts.

### 5. Per-Target Deduplication

For each target, the pipeline checks:
```sql
SELECT id FROM sources WHERE normalized_url = ?
```

If a source with the same `normalized_url` already exists in that target's database, that target is **skipped** (not an error — other targets continue).

### 6. SQLite Insert (Transaction)

A database transaction wraps the insert:

```sql
BEGIN TRANSACTION;

-- Insert source metadata
INSERT INTO sources (url, normalized_url, title, source_type, raw_content, content_hash, tags)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- Insert each chunk
INSERT INTO chunks (source_id, chunk_index, content) VALUES (?, ?, ?);
-- ... repeated for each embedded chunk

COMMIT;
```

On failure, `ROLLBACK` is issued and this target is skipped. The `source_id` (auto-increment) and chunk IDs are captured for use in the next steps.

### 7. ChromaDB Insert

After a successful database transaction, vectors are added to ChromaDB:

- Each vector gets an ID of `chunk_{source_id}_{chunk_id}`
- Metadata includes `source_id`, `content`, `url`, `title`, and `tags` (comma-separated)
- Inserted in batches of 100

If ChromaDB insertion fails, the SQLite data remains (no rollback). This means the source won't be re-ingested on retry (dedup will skip it) but vectors will be missing.

### 8. File Archival

The original content is archived to the target's storage repository:

```
{target.repoPath}/{SourceType}/{YYYY-MM}/{sourceId}-{sanitizedTitle}.ext
```

- `SourceType` is capitalized (e.g., `Article`, `Video`, `Pdf`)
- `YYYY-MM` is the current year-month
- `sanitizedTitle` has non-alphanumeric characters replaced with `_`, truncated to 100 chars
- For `pdf` and `text` source types where the original file exists locally, the file is **copied**
- For all other types, `originalContent` is **written** to disk

File archival failure is logged but does not affect the rest of the pipeline.

### 9. Lock Release

The lock file is removed in the `finally` block, guaranteeing cleanup regardless of success or failure.

## Error Handling Summary

| Stage | On Failure |
|-------|-----------|
| Lock acquisition | Throws, process exits |
| Extraction | Returns early, lock released |
| Classification | Returns empty tags, ingestion continues with manual tags only |
| Embedding | Returns early if zero chunks embedded, lock released |
| Dedup check | Target skipped (source already exists) |
| SQLite transaction | Target skipped (ROLLBACK), other targets continue |
| ChromaDB insert | Error logged, orphaned SQLite data remains |
| File archival | Error logged, pipeline continues |
