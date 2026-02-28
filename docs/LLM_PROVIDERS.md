# LLM Providers

All LLM operations (text generation and embedding) are centralized in `src/llm-provider.ts`. This module implements a fallback chain so the system degrades gracefully when a provider is unavailable.

## Provider Hierarchy

```
Request (generate or embed)
    │
    ├──▶ 1. Gemini (Google)  ← Primary, if GOOGLE_API_KEY is set
    ├──▶ 2. OpenAI           ← Fallback, if OPENAI_API_KEY is set
    ├──▶ 3. Minimax          ← Fallback, if MINIMAX_API_KEY is set
    ├──▶ 4. OpenRouter       ← Fallback, free models if OPENROUTER_API_KEY is set
    └──▶ Throw Error         ← All providers exhausted
```

Provider selection is determined by which API keys are present in the environment at startup. If a key is set, that provider is attempted. If it fails, the next provider in the chain is tried.

## Text Generation

### Function: `generateText(prompt, systemInstruction?)`

Generates a text response from a prompt with an optional system instruction.

| Provider | Model | Notes |
|----------|-------|-------|
| Gemini | `gemini-2.0-flash` (configurable) | System instruction via `getGenerativeModel()` |
| OpenAI | `gpt-4o-mini` | OpenAI Chat Completions API |
| Minimax | `MiniMax-M2.5` (Coding Plan) | REST API with `system` role |
| OpenRouter | `google/gemma-2-9b-it:free` (configurable) | Free models; append `:free` for no-cost |

**Gemini** uses the `@google/generative-ai` SDK:
```typescript
const model = genAI.getGenerativeModel({ model, systemInstruction });
const result = await model.generateContent(prompt);
```

**Minimax** uses a REST API call via `axios`:
- Endpoint: `https://api.minimax.io/v1/text/chatcompletion_v2?GroupId={groupId}`
- Auth: Bearer token in `Authorization` header
- Payload: `{ model, messages: [...], stream: false }`

## Embeddings

### Function: `getEmbeddings(texts: string[])`

Takes an array of strings and returns an array of number arrays (vectors).

| Provider | Model | Notes |
|----------|-------|-------|
| Gemini | `embedding-001` | REST API batch |
| OpenAI | `text-embedding-3-small` | OpenAI Embeddings API |
| Minimax | `embo-01` | REST API with `type: "db"` |
| OpenRouter | `nomic-ai/nomic-embed-text-v1.5` (configurable) | Routes to various embedding models |

**Gemini** uses batch embedding:
```typescript
const result = await model.batchEmbedContents({
  requests: texts.map(t => ({ content: { role: "user", parts: [{ text: t }] } }))
});
```

**Minimax** uses a REST API:
- Endpoint: `https://api.minimax.io/v1/embeddings?GroupId={groupId}`
- Payload: `{ model: "embo-01", texts: [...], type: "db" }`

## Usage in the Codebase

| Module | Uses | Purpose |
|--------|------|---------|
| `embedder.ts` | `getEmbeddings()` | Generate chunk embeddings during ingestion |
| `query.ts` | `getEmbeddings()` | Embed the user's query for vector search |
| `query.ts` | `generateText()` | Generate the final answer from retrieved context |
| `classifier.ts` | `generateText()` | Auto-tag content via LLM classification |

## Error Behavior

- **Gemini failure**: Logs a warning (`"Gemini generation failed, trying fallback..."`) and proceeds to Minimax.
- **Minimax failure**: Logs the full error. For Axios errors, includes the HTTP status and response body.
- **All providers fail**: Throws `"All LLM providers failed. Please check your API keys."` (for generation) or `"All Embedding providers failed."` (for embeddings).
