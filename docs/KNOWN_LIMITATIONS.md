# Known Limitations

This document lists the current limitations, inconsistencies, and areas for improvement in the codebase.

## Stub: Extractor (`src/extractor.ts`)

This limitation has been resolved. The extractor is now fully implemented and supports:
- Web articles (via `axios`, `jsdom`, `@mozilla/readability`)
- PDFs (via `pdf-parse`)
- YouTube videos (via `transcriptapi.com`)
- Tweets (via Twitter oembed API)
- Instagram Reels (via OpenGraph meta tags)
- Local text files

## Hardcoded Query Collection

This limitation has been resolved. The `query` command now accepts a `--target` flag to specify which knowledge base to query (`pablo`, `paloma`, or `reels`). It defaults to `pablo`.

## Compiled JS Files in `src/`

This limitation has been resolved. The `.gitignore` now includes patterns for compiled files in `src/` (`*.js`, `*.d.ts`, `*.d.ts.map`, `*.js.map`).

## No Structured Output / Exit Codes

This limitation has been resolved. Both `ingest` and `query` commands now return structured JSON output when used with the `--json` flag, and use appropriate exit codes (`0` for success, `1` for failure).

## No Test Suite

`package.json` has `"test": "echo \"Error: no test specified\" && exit 1"`. There are no tests of any kind.

## Unused `OPENAI_API_KEY`

The `.env.example` file includes `OPENAI_API_KEY` and `config.ts` reads it, but `llm-provider.ts` does not use OpenAI as a provider. The `config.ts` also references `fallbackEmbeddingModel: 'text-embedding-3-small'` (an OpenAI model) but this is never used. The actual fallback is Minimax, not OpenAI.

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

## Autonomous Agent Integration

While the CLI is now fully functional for programmatic use (JSON output, exit codes), the logic for *deciding when* to ingest (e.g., monitoring a feed for new content) or *scheduling* queries is currently external to this project and would need to be implemented by the calling agent (e.g., OpenClaw).
