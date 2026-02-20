
import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import { config } from './config';

const client = new ChromaClient();

// Note: ChromaDB's JS client currently requires an embedding function
// even if we provide our own embeddings. We can provide a dummy one
// since we will be generating embeddings ourselves with Google/OpenAI clients.
const embedder = new OpenAIEmbeddingFunction({ openai_api_key: "dummy-key-not-used" });

// Cache collection objects
const collections = new Map<string, any>();

async function getOrCreateCollection(collectionName: string) {
    if (collections.has(collectionName)) {
        return collections.get(collectionName);
    }

        try {
            const collection = await client.getCollection({
                name: collectionName,
                embeddingFunction: embedder
            });
            console.error(`Connected to existing ChromaDB collection: "${collectionName}"`);
            collections.set(collectionName, collection);
            return collection;
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error("ChromaDB connection failed. Is ChromaDB running on localhost:8000?");
            }
            console.error(`Collection not found. Creating new ChromaDB collection: "${collectionName}"`);
        const collection = await client.createCollection({
            name: collectionName,
            embeddingFunction: embedder
        });
        collections.set(collectionName, collection);
        return collection;
    }
}

export async function addChunksToVectorStore(
    collectionName: string,
    chunks: { id: number, source_id: number, content: string, url: string, title: string, tags: string[] }[], 
    embeddings: number[][]
) {
    const coll = await getOrCreateCollection(collectionName);
    
    if (chunks.length !== embeddings.length) {
        throw new Error("Number of chunks and embeddings must match.");
    }

    const ids = chunks.map(chunk => `chunk_${chunk.source_id}_${chunk.id}`); // Make ID unique across DB resets
    const metadatas = chunks.map(chunk => ({
        source_id: chunk.source_id,
        content: chunk.content, 
        url: chunk.url,
        title: chunk.title,
        tags: chunk.tags.join(',')
    }));

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
        console.error(`Added batch of ${batchIds.length} embeddings to ChromaDB collection '${collectionName}'.`);
    }
}

export async function queryVectorStore(collectionName: string, queryEmbedding: number[], topN = 10, whereFilter: object = {}) {
    const coll = await getOrCreateCollection(collectionName);
    const results = await coll.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topN,
        where: whereFilter,
    });
    return results;
}
