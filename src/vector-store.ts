
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import { config } from './config';

const client = new ChromaClient();
const COLLECTION_NAME = config.chromaCollectionName;

// Note: ChromaDB's JS client currently requires an embedding function
// even if we provide our own embeddings. We can provide a dummy one
// since we will be generating embeddings ourselves with Google/OpenAI clients.
// This is a known limitation that may change in future versions.
const embedder = new OpenAIEmbeddingFunction({ openai_api_key: "dummy-key-not-used" });

async function getOrCreateCollection() {
    try {
        const collection = await client.getCollection({
            name: COLLECTION_NAME,
            embeddingFunction: embedder
        });
        console.log(`Connected to existing ChromaDB collection: "${COLLECTION_NAME}"`);
        return collection;
    } catch (error) {
        console.log(`Collection not found. Creating new ChromaDB collection: "${COLLECTION_NAME}"`);
        const collection = await client.createCollection({
            name: COLLECTION_NAME,
            embeddingFunction: embedder
        });
        return collection;
    }
}

export const collection = getOrCreateCollection();

export async function addChunksToVectorStore(chunks: { id: number, source_id: number, content: string, url: string, title: string, tags: string[] }[], embeddings: number[][]) {
    const coll = await collection;
    
    if (chunks.length !== embeddings.length) {
        throw new Error("Number of chunks and embeddings must match.");
    }

    const ids = chunks.map(chunk => `chunk_${chunk.id}`);
    const metadatas = chunks.map(chunk => ({
        source_id: chunk.source_id,
        content: chunk.content, // Storing content here avoids a second DB lookup
        url: chunk.url,
        title: chunk.title,
        tags: chunk.tags.join(',') // ChromaDB metadata values must be strings, numbers, or booleans
    }));

    // ChromaDB JS client upsert limit is around 5000, batching is safer for large inputs
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);
        const batchEmbeddings = embeddings.slice(i, i + batchSize);
        const batchMetadatas = metadatas.slice(i, i + batchSize);

        await coll.add({
            ids: batchIds,
            embeddings: batchEmbeddings,
            metadatas: batchMetadatas,
        });
        console.log(`Added batch of ${batchIds.length} embeddings to ChromaDB.`);
    }
}

export async function queryVectorStore(queryEmbedding: number[], topN = 10, whereFilter: object = {}) {
    const coll = await collection;
    const results = await coll.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topN,
        where: whereFilter,
    });
    return results;
}
