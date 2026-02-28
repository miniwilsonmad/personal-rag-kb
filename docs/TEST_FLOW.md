# Testing the Instagram/YouTube RAG Flow

## Prerequisites

1. **ChromaDB**: `docker run -p 8000:8000 chromadb/chroma`
2. **Storage directory**: `mkdir -p ../instagram-reels-storage` (for reels target)
3. **sqlite3**: If ingestion fails with "Could not locate bindings file", run:
   ```bash
   pnpm approve-builds  # Approve sqlite3 when prompted
   pnpm install
   ```
4. **.env**: `GOOGLE_API_KEY` or `MINIMAX_API_KEY` for embeddings and classification

## Test 1: Extractor Only (No DB/ChromaDB)

Validates downloader JSON extraction without external services:

```bash
pnpm run build
pnpm run test:extractor
```

Expect: "All extractor tests passed" with title, source, content preview.

## Test 2: Full Flow (End-to-End)

### Step 2a: Produce downloader output

From project root:

```bash
cd Instagram-reels-rag
pnpm install              # Uses .npmrc ignore-workspace so deps install locally
pnpm run setup:yt-dlp     # Bundles yt-dlp; avoids "Requested format is not available"
pnpm analyze "https://www.youtube.com/watch?v=dQw4w9WgXcQ" -o ./output --output-format both
cd ..
```

Or use a pre-created test file at `Instagram-reels-rag/output/test-reel.json`.

### Step 2b: Ingest into RAG

**Single file:**
```bash
pnpm start ingest ./Instagram-reels-rag/output/test-reel.json --targets reels
```

**Directory (all JSON files):**
```bash
pnpm start ingest ./Instagram-reels-rag/output --targets reels
```

### Step 2c: Query

```bash
pnpm start query "What was the main topic?" --target reels
```
