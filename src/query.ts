
import { getEmbeddings, generateText } from './llm-provider';
import { queryVectorStore } from './vector-store';

export interface QuerySource {
    url: string;
    title: string;
    content: string;
    distance: number;
}

export interface QueryResult {
    success: boolean;
    answer?: string;
    sources?: QuerySource[];
    error?: string;
}

export async function answerQuery(query: string, tags: string[] = [], target: string = 'pablo'): Promise<QueryResult> {
    if (!query) {
        console.error("A query is required.");
        return { success: false, error: "A query is required." };
    }

    console.error(`Querying target \'${target}\' with: "${query}"`);

    // 1. Embed query (Agnostic)
    console.error("Embedding query...");
    let queryVector: number[];
    try {
        const embeddings = await getEmbeddings([query]);
        queryVector = embeddings[0];
    } catch (error: any) {
        console.error("Failed to embed query:", error.message);
        return { success: false, error: `Failed to embed query: ${error.message}` };
    }

    // 2. Query Vector Store (ChromaDB)
    console.error(`Querying vector store... (tags: ${tags.join(', ') || 'none'})`);
    const collectionName = `${target}_kb`; 
    
    const whereFilter = tags.length > 0 
        ? { "$and": tags.map(tag => ({ "tags": { "$contains": tag } })) }
        : {};

    const searchResults = await queryVectorStore(collectionName, queryVector, 10, whereFilter);
    
    const metadatas = searchResults.metadatas?.[0] || [];
    const distances = (searchResults.distances?.[0] || []) as number[];

    if (metadatas.length === 0) {
        console.error("Could not find any relevant context.");
        return { success: true, answer: "No relevant context found in the knowledge base.", sources: [] };
    }
    
    // 3. Deduplicate
    const bestChunksPerSource = new Map<string, {metadata: any, distance: number}>();
    for(let i = 0; i < metadatas.length; i++) {
        const metadata = metadatas[i];
        const distance = distances[i];
        if (!metadata || !metadata.url) continue;
        // @ts-ignore
        if (!bestChunksPerSource.has(metadata.url) || bestChunksPerSource.get(metadata.url)!.distance > distance) {
            bestChunksPerSource.set(metadata.url as string, { metadata, distance });
        }
    }

    const finalContextChunks = Array.from(bestChunksPerSource.values())
        .sort((a, b) => a.distance - b.distance);

    const sources: QuerySource[] = finalContextChunks.map(chunk => ({
        url: chunk.metadata.url,
        title: chunk.metadata.title,
        content: chunk.metadata.content,
        distance: chunk.distance,
    }));

    // 4. Generate Answer (Agnostic)
    const context = sources.map((s, i) => 
        `Source ${i+1} (URL: ${s.url}, Title: ${s.title}):\n${s.content}`
    ).join('\n\n---\n\n');

    const prompt = `
        Answer the following question using ONLY the provided context. 
        If the context does not contain enough information, state that you cannot answer the question.
        Cite which sources you drew from by referencing the Source numbers (e.g., [Source 1]).
        
        Question: ${query}
        
        Context:
        ${context}
    `;

    console.error("Generating final answer...");
    try {
        const answer = await generateText(prompt);
        return { success: true, answer, sources };
    } catch (error: any) {
        console.error("Failed to generate answer:", error.message);
        return { success: false, error: `Failed to generate answer: ${error.message}` };
    }
}
