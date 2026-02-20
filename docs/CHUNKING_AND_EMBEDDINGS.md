# Chunking and Embeddings

This document describes how text content is split into chunks and converted to vector embeddings. The implementation lives in `src/embedder.ts`.

## Chunking Algorithm

### Function: `chunkContent(content: string): Chunk[]`

The chunking strategy uses **sentence-boundary splitting with overlap** to preserve context across chunk boundaries.

### Parameters (hardcoded)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `chunkSize` | 800 chars | Target maximum size for each chunk |
| `chunkOverlap` | 200 chars | Characters of overlap between consecutive chunks |
| `minChunkSize` | 100 chars | Minimum size — smaller trailing chunks are merged into the previous chunk |

### Algorithm Steps

1. **Split on sentence boundaries**: Content is split using the regex `/(?<=[.!?])\s+/`, which breaks on whitespace following `.`, `!`, or `?`.

2. **Accumulate sentences into chunks**: Sentences are added to the current chunk until adding the next sentence would exceed `chunkSize` (800 chars).

3. **Create overlap**: When a chunk boundary is reached:
   - The current chunk is finalized.
   - A new chunk starts with the **last 200 characters** of the previous chunk, plus the sentence that triggered the boundary.

4. **Handle trailing content**: If the final accumulated text is shorter than `minChunkSize` (100 chars), it's appended to the last chunk rather than creating a tiny standalone chunk.

### Output

Each chunk is a `{ content: string, chunk_index: number }` object. The `chunk_index` is a 0-based sequential counter.

### Example

For a 2000-character document with 10 sentences:
```
Chunk 0: sentences 1-4   (~800 chars)
Chunk 1: [overlap from chunk 0] + sentences 5-7   (~800 chars)
Chunk 2: [overlap from chunk 1] + sentences 8-10  (~remaining chars)
```

## Embedding

### Function: `embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]>`

Generates vector embeddings for each chunk using the LLM provider (see [LLM Providers](./LLM_PROVIDERS.md)).

### Batching

| Parameter | Value | Description |
|-----------|-------|-------------|
| Batch size | 10 chunks | Number of chunks sent per embedding API call |
| Delay between batches | 200ms | Rate-limiting delay to avoid hitting API limits |

Chunks are processed in sequential batches of 10. Each batch collects its chunks, checks the cache, and sends only uncached chunks to the embedding API.

### LRU Cache

An in-memory LRU cache avoids re-embedding identical text:

| Property | Value |
|----------|-------|
| Implementation | `lru-cache` package |
| Max entries | 1000 |
| Key | The chunk's text content (string) |
| Value | The embedding vector (number[]) |

The cache is checked per-chunk before making API calls. Only chunks without cached embeddings are sent to the provider. After receiving results, new embeddings are stored in the cache.

This cache is **in-memory only** — it resets when the process exits. It's useful when the same content appears across multiple targets in a single ingestion run or when re-running ingestion on already-processed content.

### Error Handling

If an embedding batch fails:
- The error is logged (`"Embedding batch failed: ..."`)
- The failed chunks are **silently skipped** (they won't appear in `embeddedChunks`)
- Processing continues with the next batch

If the final `embeddedChunks` array is empty after all batches, `ingest.ts` halts the ingestion.

## Data Types

```typescript
interface Chunk {
    content: string;
    chunk_index: number;
}

interface EmbeddedChunk extends Chunk {
    embedding: number[];  // Vector of floats
}
```
