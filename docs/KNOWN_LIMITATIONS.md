# Known Limitations

This document lists the current stubs, hardcoded values, and areas where the codebase is incomplete or inconsistent.

## Stub: Extractor (`src/extractor.ts`)

The extractor is a **minimal stub** that returns hardcoded test data:

```typescript
return {
    title: "Test",
    content: "Test content",
    originalContent: "Test content",
    sourceType: "text",
    fileExtension: ".txt",
    source: source,
    normalizedSource: source,
    contentHash: "testhash"
};
```

The README describes support for web articles, PDFs, YouTube transcripts, and tweets, but none of these extraction methods are currently implemented. The extractor needs to be built out with:
- URL content fetching (the project has `axios`, `jsdom`, and `@mozilla/readability` as dependencies for this)
- PDF parsing (`pdf-parse` is a dependency)
- YouTube transcript fetching (`TRANSCRIPT_API_KEY` is configured but unused)
- Source type detection and URL normalization
- Content hashing

## Hardcoded Query Collection

In `src/query.ts`, the ChromaDB collection is hardcoded to `reels_kb`:

```typescript
const collectionName = 'reels_kb';
```

This means all queries search only the `reels` target's collection, regardless of which targets were used during ingestion. The query command has no `--targets` flag to select a different collection.

## No Test Suite

`package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`. There are no tests of any kind.

## Unused `OPENAI_API_KEY`

The `.env.example` file includes `OPENAI_API_KEY` and `config.ts` reads it, but `llm-provider.ts` does not use OpenAI as a provider. The `config.ts` also references `fallbackEmbeddingModel: 'text-embedding-3-small'` (an OpenAI model) but this is never used. The actual fallback is Minimax, not OpenAI.

## Compiled JS Files in `src/`

The `tsconfig.json` sets `outDir: "dist"`, and `.gitignore` ignores `dist/`. However, there are compiled `.js`, `.d.ts`, `.d.ts.map`, and `.js.map` files sitting in the `src/` directory. These appear to be from running `tsc` with a different config or manually. They should be gitignored or removed.

## ChromaDB Dummy Embedding Function

`src/vector-store.ts` passes a dummy OpenAI API key to ChromaDB:

```typescript
const embedder = new OpenAIEmbeddingFunction({ openai_api_key: "dummy-key-not-used" });
```

This is because ChromaDB's JS client requires an embedding function to be provided when creating/getting a collection, even though this project generates its own embeddings externally. The dummy key is never actually used for API calls.

## No ChromaDB Cleanup on Source Deletion

If a source is deleted from SQLite (manually), its chunks are cascade-deleted from the `chunks` table, but the corresponding vectors in ChromaDB are **not** cleaned up. There is no deletion/sync mechanism.

## Tag Storage Format Mismatch

Tags are stored as a **JSON array** in SQLite (`'["tag1","tag2"]'`) but as a **comma-separated string** in ChromaDB metadata (`"tag1,tag2"`). The query filter uses ChromaDB's `$contains` operator on the comma-separated string, which can produce false positives (e.g., searching for tag `"ai"` would match `"air"` or `"fairy"`).

## Classification Reference Target

The classifier fetches existing tags from the `reels` target database by default (falling back to the first specified target). This means if you only ingest into `pablo`, the classifier still looks at `reels`'s tags for the existing topic list.
