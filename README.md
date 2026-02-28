# Personal RAG Knowledge Base

This project is a command-line application for creating and querying a personal knowledge base using the RAG (Retrieval-Augmented Generation) pattern. It can ingest content from web articles, local PDFs, YouTube videos, and Tweets, store them in a vector database, and use them to answer questions.

## Features

- **Multi-Source Ingestion**: Handles web articles, local PDFs, YouTube transcripts, and Tweets.
- **Robust Extraction**: Tiered fallback system for web content extraction.
- **Deduplication**: Avoids duplicate content via normalized source identifier and content hashing.
- **Tagging**: Add tags to sources for filtered queries.
- **Vector Search**: Uses ChromaDB for efficient, local similarity search.
- **RAG-based Q&A**: Employs a language model (Gemini) to synthesize answers from retrieved context.
- **Configurable**: Manage all settings and API keys via a `.env` file.
- **User-Friendly CLI**: A simple and powerful command-line interface.

## Setup

### 1. Prerequisites
- Node.js (v18 or higher)
- Docker (for running ChromaDB)
- Git

### 2. Run ChromaDB
This project requires a running ChromaDB instance. The easiest way to get one started is with Docker:
```bash
docker run -p 8000:8000 chromadb/chroma
```
This will start a ChromaDB server on `http://localhost:8000`.

### 3. Clone and Install
```bash
git clone --recurse-submodules <repository_url>
cd personal-rag-kb
npm install
```
If you already cloned without submodules, run `git submodule update --init --recursive`.

### 4. Configure Environment
Create a `.env` file in the root of the project by copying the example file:
```bash
cp .env.example .env
```
Now, edit the `.env` file and add your API keys:
- `GOOGLE_API_KEY`: Required for Gemini embeddings and text generation.
- `TRANSCRIPT_API_KEY`: Required for fetching YouTube transcripts from [transcriptapi.com](https://transcriptapi.com).
- `OPENAI_API_KEY`: Optional, used as a fallback for embeddings.

### 5. Compile the Project
```bash
npm run build 
```

## Usage

The application is run via the `npm start --` command, or directly with `node dist/cli.js`.

### Ingesting Content
To add a new document to your knowledge base, use the `ingest` command.

**Ingest a URL:**
```bash
npm start -- ingest "https://example.com/some-article-url"
```

**Ingest a local PDF:**
```bash
npm start -- ingest "/path/to/your/document.pdf"
```

**Ingest with tags:**
Use the `--tags` or `-t` flag to add comma-separated tags.
```bash
npm start -- ingest "https://example.com/some-article-url" --tags "tech,ai,important"
```

**Ingesting Instagram/YouTube content (via downloader submodule):**

The `Instagram-reels-rag` submodule ([youtube-IG-FB-downloader-for-RAG](https://github.com/pablomadrigal/youtube-IG-FB-downloader-for-RAG)) handles video download, transcription, and OCR. This repo ingests its JSON output into the RAG pipeline. Two-step workflow:

1. Download and analyze a video:
```bash
cd Instagram-reels-rag && pnpm analyze "https://www.instagram.com/reel/REEL_ID/" -o ./output --output-format both
```

2. Ingest the output into the knowledge base:
```bash
npm start -- ingest ./Instagram-reels-rag/output --targets reels
```

You can also ingest a single JSON file: `npm start -- ingest ./Instagram-reels-rag/output/REEL_ID.json --targets reels`.

### Querying the Knowledge Base
To ask a question, use the `query` command.

**Basic query:**
```bash
npm start -- query "What is the main point of the article about AI?"
```

**Query with tag filter:**
Use the `--tags` or `-t` flag to filter the search to only include sources with *all* of the specified tags.
```bash
npm start -- query "Summarize the important articles" --tags "ai,important"
```

## Documentation

Detailed documentation is available in the [`docs/`](./docs/) folder:

| Document | Description |
|----------|-------------|
| [Overview](./docs/README.md) | Key concepts, tech stack, and documentation index |
| [Architecture](./docs/ARCHITECTURE.md) | System design, component overview, and data flow diagrams |
| [Commands](./docs/COMMANDS.md) | CLI command reference with all arguments and options |
| [Configuration](./docs/CONFIGURATION.md) | Environment variables and target configuration |
| [Data Model](./docs/DATA_MODEL.md) | SQLite schema and ChromaDB collection structure |
| [Ingestion Pipeline](./docs/INGESTION_PIPELINE.md) | Step-by-step walkthrough of the ingestion process |
| [LLM Providers](./docs/LLM_PROVIDERS.md) | LLM provider hierarchy, models, and fallback behavior |
| [Chunking & Embeddings](./docs/CHUNKING_AND_EMBEDDINGS.md) | Text chunking algorithm and embedding strategy |
| [Known Limitations](./docs/KNOWN_LIMITATIONS.md) | Current stubs, hardcoded values, and areas for improvement |
