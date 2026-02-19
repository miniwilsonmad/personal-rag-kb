
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { LRUCache } from 'lru-cache';

import { config } from './config';

// --- Configuration ---
const GOOGLE_API_KEY = config.googleApiKey;
const OPENAI_API_KEY = config.openaiApiKey;

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY!);
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const primaryEmbeddingModel = config.primaryEmbeddingModel;
const fallbackEmbeddingModel = config.fallbackEmbeddingModel;

const cache = new LRUCache<string, number[]>({ max: 1000 });

// --- Interfaces ---
export interface Chunk {
    content: string;
    chunk_index: number;
}

export interface EmbeddedChunk extends Chunk {
    embedding: number[];
    embedding_dim: number;
    embedding_provider: 'google' | 'openai';
    embedding_model: string;
}

// --- Chunking Logic ---
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

// --- Embedding Generation ---
async function getGoogleEmbedding(batch: string[]): Promise<number[][]> {
    const model = genAI.getGenerativeModel({ model: primaryEmbeddingModel });
    const result = await model.batchEmbedContents({
        requests: batch.map(content => ({ content })),
    });
    return result.embeddings.map(e => e.values);
}

async function getOpenAIEmbedding(batch: string[]): Promise<number[][]> {
    if (!openai) throw new Error("OpenAI API key not configured for fallback.");
    const response = await openai.embeddings.create({
        model: fallbackEmbeddingModel,
        input: batch,
    });
    return response.data.map(d => d.embedding);
}

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
    const embeddedChunks: EmbeddedChunk[] = [];
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        const batchContent = batchChunks.map(c => c.content);

        // Check cache first
        const cachedResults = new Map<number, EmbeddedChunk>();
        const contentToEmbed: string[] = [];
        const originalIndices: number[] = [];

        batchChunks.forEach((chunk, index) => {
            const cachedEmbedding = cache.get(chunk.content);
            if (cachedEmbedding) {
                cachedResults.set(index, {
                    ...chunk,
                    embedding: cachedEmbedding,
                    embedding_dim: cachedEmbedding.length,
                    embedding_provider: 'google', // Assuming primary for cache
                    embedding_model: primaryEmbeddingModel,
                });
            } else {
                contentToEmbed.push(chunk.content);
                originalIndices.push(index);
            }
        });
        
        if (contentToEmbed.length > 0) {
            let embeddings: number[][] | null = null;
            let provider: 'google' | 'openai' = 'google';
            let modelName = primaryEmbeddingModel;

            // Primary provider with retries
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    embeddings = await getGoogleEmbedding(contentToEmbed);
                    break;
                } catch (error) {
                    console.error(`Google embedding failed (Attempt ${attempt}):`, error.message);
                    if (attempt === 3) break;
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
                }
            }

            // Fallback provider
            if (!embeddings && openai) {
                console.warn("Google embedding failed after all retries. Falling back to OpenAI.");
                provider = 'openai';
                modelName = fallbackEmbeddingModel;
                try {
                    embeddings = await getOpenAIEmbedding(contentToEmbed);
                } catch (error) {
                    console.error("OpenAI fallback embedding also failed:", error.message);
                }
            }

            if (embeddings && embeddings.length === contentToEmbed.length) {
                embeddings.forEach((embedding, idx) => {
                    const originalIndex = originalIndices[idx];
                    const originalChunk = batchChunks[originalIndex];
                    cache.set(originalChunk.content, embedding); // Cache the new embedding
                    cachedResults.set(originalIndex, {
                        ...originalChunk,
                        embedding,
                        embedding_dim: embedding.length,
                        embedding_provider: provider,
                        embedding_model: modelName,
                    });
                });
            }
        }
        
        // Add results in original order
        for (let j = 0; j < batchChunks.length; j++) {
            if (cachedResults.has(j)) {
                embeddedChunks.push(cachedResults.get(j)!);
            }
        }

        if (i + batchSize < chunks.length) {
            await new Promise(res => setTimeout(res, 200)); // Delay between batches
        }
    }

    return embeddedChunks;
}
