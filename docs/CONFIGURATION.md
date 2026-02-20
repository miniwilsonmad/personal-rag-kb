# Configuration

All configuration is managed via environment variables loaded from a `.env` file in the project root. Copy `.env.example` to `.env` and fill in your keys.

```bash
cp .env.example .env
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_API_KEY` | API key for Google Gemini. Used as the primary provider for both text generation and embeddings. | Yes (unless Minimax is configured) |
| `MINIMAX_API_KEY` | API key for Minimax. Used as fallback when Gemini is unavailable or fails. | Optional |
| `MINIMAX_GROUP_ID` | Group ID for the Minimax API. Required if using Minimax — it is appended to the API URL as a query parameter. | Required if using Minimax |
| `OPENAI_API_KEY` | API key for OpenAI. Referenced in `.env.example` but **not currently used** by `llm-provider.ts`. Exists for potential future use. | Optional |
| `TRANSCRIPT_API_KEY` | API key for [transcriptapi.com](https://transcriptapi.com), used for fetching YouTube transcripts (when the extractor is fully implemented). | Optional |
| `DB_PATH` | Path to the default SQLite database file. Note: each target overrides this with its own `dbPath`. | Optional (default: `./knowledge_base.db`) |
| `CHROMA_COLLECTION_NAME` | Default ChromaDB collection name. Note: each target overrides this with its own `collectionName`. | Optional (default: `knowledge_base`) |

### Provider selection

The LLM provider is selected automatically at runtime based on which API keys are present:

1. If `GOOGLE_API_KEY` is set, Gemini is used as the primary provider.
2. If Gemini fails or its key is absent, and `MINIMAX_API_KEY` is set, Minimax is used as fallback.
3. If all providers fail, operations throw an error.

See [LLM Providers](./LLM_PROVIDERS.md) for the full provider hierarchy and model details.

## Targets Configuration

Targets define where ingested data is stored. Each target has three properties:

| Property | Description |
|----------|-------------|
| `repoPath` | Root directory for file archival (sibling directory to this project) |
| `dbPath` | Path to the target's SQLite database file |
| `collectionName` | Name of the ChromaDB collection for this target |

The targets are hardcoded in `src/ingest.ts`:

| Target | `repoPath` | `dbPath` | `collectionName` |
|--------|------------|----------|-------------------|
| `pablo` | `../personal-rag-kb-storage/` | `../personal-rag-kb-storage/knowledge_base.db` | `pablo_kb` |
| `paloma` | `../paloma-rag-kb-storage/` | `../paloma-rag-kb-storage/knowledge_base.db` | `paloma_kb` |
| `reels` | `../instagram-reels-storage/` | `../instagram-reels-storage/knowledge_base.db` | `reels_kb` |

All paths are resolved relative to `src/` (or `dist/`) using `path.resolve(__dirname, '../../<dir>')`, so they point to sibling directories of the project root.

These target directories must exist before running ingestion. If a target directory is missing, that target is skipped with an error message.
