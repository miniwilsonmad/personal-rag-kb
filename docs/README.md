# Personal RAG Knowledge Base

Personal RAG KB is a CLI tool for ingesting and querying personal knowledge bases. It supports multiple targets (e.g., Pablo's knowledge, Paloma's knowledge, Instagram Reels) and uses a combination of SQLite for metadata and ChromaDB for vector search.

## Key Concepts

- **Ingestion**: The process of adding new content (URLs, files) to the knowledge base.
- **Querying**: Asking questions against the ingested content using embeddings and an LLM.
- **Targets**: Separate storage spaces for different users or categories (pablo, paloma, reels).
- **Classification**: Automatic tagging of content using AI.

## Tech Stack

- **Language**: TypeScript / Node.js
- **Database**: SQLite (Metadata & Content Hashes)
- **Vector Store**: ChromaDB (Embeddings)
- **LLM Provider**: Gemini (Google) or Minimax (Fallback)
- **CLI**: Yargs

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | System design, component overview, and data flow diagrams |
| [Commands](./COMMANDS.md) | CLI command reference with all arguments and options |
| [Configuration](./CONFIGURATION.md) | Environment variables and target configuration |
| [Data Model](./DATA_MODEL.md) | SQLite schema and ChromaDB collection structure |
| [Ingestion Pipeline](./INGESTION_PIPELINE.md) | Step-by-step walkthrough of the ingestion process |
| [LLM Providers](./LLM_PROVIDERS.md) | LLM provider hierarchy, models, and fallback behavior |
| [Chunking & Embeddings](./CHUNKING_AND_EMBEDDINGS.md) | Text chunking algorithm and embedding strategy |
| [Known Limitations](./KNOWN_LIMITATIONS.md) | Current stubs, hardcoded values, and areas for improvement |

## Maintenance

See [Configuration](./CONFIGURATION.md) for details on:
- **Backups**: Automated daily backups using `backup.sh` and cron.
- **ChromaDB**: Running with persistent Docker volumes.

