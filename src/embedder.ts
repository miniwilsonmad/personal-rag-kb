
import { LRUCache } from 'lru-cache';
import { getEmbeddings } from './llm-provider';

const cache = new LRUCache<string, number[]>({ max: 1000 });

export interface Chunk {
    content: string;
    chunk_index: number;
}

export interface EmbeddedChunk extends Chunk {
    embedding: number[];
}

export function chunkContent(content: string): Chunk[] {
    const chunkSize = 800;
    const chunkOverlap = 200;
    const minChunkSize = 100;

    const sentences = content.split(/(?<=[.!?])\s+/);
    const chunks: Chunk[] = [];
    let currentChunk = "";
    let chunkIndex = 0;

    for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
            currentChunk += (currentChunk ? " " : "") + sentence;
        } else {
            chunks.push({ content: currentChunk, chunk_index: chunkIndex++ });
            const overlapIndex = Math.max(0, currentChunk.length - chunkOverlap);
            currentChunk = currentChunk.substring(overlapIndex) + " " + sentence;
        }
    }

    if (currentChunk) {
        if (currentChunk.length < minChunkSize && chunks.length > 0) {
            chunks[chunks.length - 1].content += " " + currentChunk;
        } else {
            chunks.push({ content: currentChunk, chunk_index: chunkIndex++ });
        }
    }

    return chunks;
}

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    const embeddedChunks: EmbeddedChunk[] = [];
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        
        const contentToEmbed: string[] = [];
        const originalIndices: number[] = [];
        const cachedResults = new Map<number, EmbeddedChunk>();

        batchChunks.forEach((chunk, index) => {
            const cachedEmbedding = cache.get(chunk.content);
            if (cachedEmbedding) {
                cachedResults.set(index, { ...chunk, embedding: cachedEmbedding });
            } else {
                contentToEmbed.push(chunk.content);
                originalIndices.push(index);
            }
        });
        
        if (contentToEmbed.length > 0) {
            try {
                // Use the agnostic provider
                const embeddings = await getEmbeddings(contentToEmbed);
                
                embeddings.forEach((embedding, idx) => {
                    const originalIndex = originalIndices[idx];
                    const originalChunk = batchChunks[originalIndex];
                    cache.set(originalChunk.content, embedding);
                    cachedResults.set(originalIndex, { ...originalChunk, embedding });
                });
            } catch (error) {
                console.error("Embedding batch failed:", (error as Error).message);
                throw error; // Re-throw the error
            }
        }
        
        for (let j = 0; j < batchChunks.length; j++) {
            if (cachedResults.has(j)) {
                embeddedChunks.push(cachedResults.get(j)! as EmbeddedChunk);
            } else {
                // If a chunk failed to embed, we should still push it as a placeholder or handle appropriately.
                // For now, we'll push it without an embedding (or with a null/empty embedding).
                // The caller should ideally handle chunks without embeddings.
                embeddedChunks.push({ ...batchChunks[j], embedding: [] }); // Placeholder for failed embedding
            }
        }

        if (i + batchSize < chunks.length) {
            await new Promise(res => setTimeout(res, 200));
        }
    }

    return embeddedChunks;
}
