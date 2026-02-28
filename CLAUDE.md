# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # Compile TypeScript (npx tsc, src/ → dist/)
npm start -- ingest "https://example.com" --tags "ai,tech" --targets "pablo,reels"
npm start -- query "What is RAG?" --tags "ai"
```

There are no tests configured yet (`npm test` is a placeholder).

## Submodule: Instagram-reels-rag (youtube-IG-FB-downloader-for-RAG)

The `Instagram-reels-rag` submodule (repo: `youtube-IG-FB-downloader-for-RAG`) handles downloading and transcribing videos from Instagram, YouTube, and Facebook. This repo manages only the RAG pipeline (classification, embedding, vector store). After cloning, initialize submodules:

```bash
git submodule update --init --recursive
```

### Ingesting from Downloader Output

1. Run the downloader in the submodule: `cd Instagram-reels-rag && pnpm analyze "URL" -o ./output --output-format both`
2. Ingest into RAG: `pnpm start ingest ./Instagram-reels-rag/output --targets reels`

The `ingest` command accepts a directory of JSON files; it discovers all `*.json` files matching the Instagram-reels-rag schema and ingests each. Deduplication via `normalized_url` skips already-ingested items.

To update the submodule to latest: `git submodule update --remote Instagram-reels-rag`. The submodule repo is [youtube-IG-FB-downloader-for-RAG](https://github.com/pablomadrigal/youtube-IG-FB-downloader-for-RAG).

## Prerequisites

- Node.js v18+
- ChromaDB running locally: `docker run -p 8000:8000 chromadb/chroma`
- `.env` file with at minimum `GOOGLE_API_KEY` (see `.env.example`)

## Architecture

This is a personal RAG (Retrieval-Augmented Generation) knowledge base CLI. The pipeline has two main flows:

### Ingestion (`ingest <source>`)
`cli.ts` → `ingest.ts` → `extractor.ts` → `classifier.ts` → `embedder.ts` → `vector-store.ts` + `database.ts`

1. **Extract** content from a source URL/file path (`extractor.ts` — supports articles, PDFs, YouTube, Instagram Reels, Tweets, text files, and Instagram-reels-rag JSON output)
2. **Classify** content by auto-tagging via LLM (`classifier.ts` — sends content to LLM, merges auto-tags with manual tags)
3. **Chunk & Embed** the content (`embedder.ts` — sentence-boundary chunking at ~800 chars with 200 char overlap, LRU-cached embeddings)
4. **Store** metadata in SQLite (`database.ts`) and vectors in ChromaDB (`vector-store.ts`)
5. **Archive** the original file to a target-specific storage repo on disk (organized by `{SourceType}/{YYYY-MM}/`)

### Query (`query <question>`)
`cli.ts` → `query.ts` → `llm-provider.ts` + `vector-store.ts`

1. Embed the query, search ChromaDB (currently hardcoded to `reels_kb` collection), deduplicate results per source URL, generate answer via LLM with retrieved context.

### Multi-Target System
Ingestion supports multiple named targets (`pablo`, `paloma`, `reels`) defined in `ingest.ts:TARGETS`. Each target has its own SQLite DB, ChromaDB collection, and file storage repo at a sibling directory (e.g., `../personal-rag-kb-storage/`). A single ingestion extracts/embeds once, then writes to all specified targets.

### LLM Provider Hierarchy (`llm-provider.ts`)
Both text generation and embeddings use a fallback chain: **Gemini → Minimax**. The provider is selected automatically based on available API keys in `.env`.

## Key Design Decisions

- **Deduplication**: Sources are deduplicated per-target by `normalized_url` in SQLite before insertion.
- **Ingestion locking**: A PID-based lock file (`ingest.lock`) prevents concurrent ingestion; stale locks (>15 min or dead PID) are auto-cleaned.
- **TypeScript compiles to `dist/`** but `.gitignore` ignores it — compiled JS in `src/` (`.js`, `.d.ts`, `.js.map`) are build artifacts that should also be gitignored.
- **ChromaDB dummy embedder**: `vector-store.ts` passes a dummy OpenAI key to ChromaDB's embedding function because the client requires one, but embeddings are generated externally via `llm-provider.ts`.
