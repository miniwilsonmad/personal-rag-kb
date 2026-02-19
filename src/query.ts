
import { embedChunks, Chunk } from './embedder';
import { config } from './config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { queryVectorStore } from './vector-store';

// --- Configuration ---
if (!config.googleApiKey) {
    throw new Error("GOOGLE_API_KEY environment variable not set.");
}
const genAI = new GoogleGenerativeAI(config.googleApiKey);

// --- Main Query Logic ---
/**
 * Answers a query based on the content of the knowledge base.
 * @param query The user's question.
 * @param tags An array of tags to filter the search context.
 */
export async function answerQuery(query: string, tags: string[] = []) {
    if (!query) {
        console.error("A query is required.");
        return;
    }

    console.log(`Querying with: "${query}"`);

    // 1. Embed the query
    console.log("Embedding query...");
    const queryChunk: Chunk = { content: query, chunk_index: 0 };
    const embeddedQuery = await embedChunks([queryChunk]);
    if (embeddedQuery.length === 0) {
        console.error("Failed to embed the query.");
        return;
    }
    const queryVector = embeddedQuery[0].embedding;

    // 2. Query ChromaDB
    console.log(`Querying vector store... (filtering by tags: ${tags.join(', ') || 'none'})`);
    
    const whereFilter = tags.length > 0 
        ? { "$and": tags.map(tag => ({ "tags": { "$contains": tag } })) }
        : {};

    const searchResults = await queryVectorStore(queryVector, 10, whereFilter);
    
    const metadatas = searchResults.metadatas?.[0] || [];
    const distances = searchResults.distances?.[0] || [];

    if (metadatas.length === 0) {
        console.log("Could not find any relevant context for the query in the vector store.");
        return;
    }
    
    // 3. Deduplicate by source URL from metadata
    const bestChunksPerSource = new Map<string, {metadata: any, distance: number}>();
    for(let i = 0; i < metadatas.length; i++) {
        const metadata = metadatas[i];
        const distance = distances[i];

        if (!metadata || !metadata.url) continue;

        if (!bestChunksPerSource.has(metadata.url) || bestChunksPerSource.get(metadata.url)!.distance > distance) {
            bestChunksPerSource.set(metadata.url, { metadata, distance });
        }
    }

    const finalContextChunks = Array.from(bestChunksPerSource.values())
        .sort((a, b) => a.distance - b.distance);


    // 4. Sanitize and prepare context for LLM
    console.log("\n--- Top Context Chunks ---");
    finalContextChunks.forEach(chunk => {
        console.log(`[Source URL: ${chunk.metadata.url}, Dist: ${chunk.distance.toFixed(4)}] ${chunk.metadata.title}`);
    });
    console.log("-------------------------\n");

    const context = finalContextChunks.map((chunk, i) => 
        `Source ${i+1} (URL: ${chunk.metadata.url}):\n${chunk.metadata.content}`
    ).join('\n\n---\n\n');

    const prompt = `
        Answer the following question using ONLY the provided context.
        Cite which sources you drew from using the format [Source X].
        
        Question: ${query}
        
        Context:
        ${context}
    `;

    // 5. Call LLM for final answer
    console.log("Generating final answer...");
    const model = genAI.getGenerativeModel({ model: config.generativeModel });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    console.log("\n--- Answer ---");
    console.log(answer);
    console.log("--------------\n");
}
