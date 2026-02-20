# Commands

The CLI is invoked via `npm start --` or directly with `node dist/cli.js`.

## Ingest Command

Ingests a new source into the knowledge base.

```bash
npm start -- ingest <source> [options]
```

### Arguments
- `source` (required): URL or local file path of the document to ingest.

### Options
| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--tags` | `-t` | Comma-separated tags for the source | *(none)* |
| `--targets` | | Comma-separated target storage names (`pablo`, `paloma`, `reels`) | `pablo` |

### Examples

Ingest a URL into the default target (pablo):
```bash
npm start -- ingest "https://example.com/article"
```

Ingest a local PDF with tags:
```bash
npm start -- ingest "/path/to/document.pdf" --tags "research,ml"
```

Ingest into multiple targets:
```bash
npm start -- ingest "https://example.com/article" --targets "pablo,reels" --tags "tech,ai"
```

## Query Command

Asks a question to the knowledge base.

```bash
npm start -- query <question> [options]
```

### Arguments
- `question` (required): The question you want to ask.

### Options
| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--tags` | `-t` | Comma-separated tags to filter the search. Only sources with **all** specified tags are included. | *(none)* |

### Examples

Basic query:
```bash
npm start -- query "What is the main point of the article about AI?"
```

Query with tag filter:
```bash
npm start -- query "Summarize the important articles" --tags "ai,important"
```

> **Note**: Queries currently always search the `reels_kb` ChromaDB collection. See [Known Limitations](./KNOWN_LIMITATIONS.md) for details.
