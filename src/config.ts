
import dotenv from 'dotenv';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(projectRoot, '.env');
dotenv.config({ path: envPath, override: true });

export const config = {
    googleApiKey: process.env.GOOGLE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    transcriptApiKey: process.env.TRANSCRIPT_API_KEY,
    
    // Minimax Configuration (Coding Plan: MiniMax-M2.5, MiniMax-M2.5-highspeed, MiniMax-M2.1, MiniMax-M2)
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxGroupId: process.env.MINIMAX_GROUP_ID,
    minimaxChatModel: process.env.MINIMAX_CHAT_MODEL || 'MiniMax-M2.5',

    // OpenRouter (free models for simple queries)
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openrouterChatModel: process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
    openrouterEmbeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'nvidia/llama-nemotron-embed-vl-1b-v2:free',

    dbPath: process.env.DB_PATH || './knowledge_base.db',
    chromaCollectionName: process.env.CHROMA_COLLECTION_NAME || 'knowledge_base',

    primaryEmbeddingModel: 'embedding-001',
    fallbackEmbeddingModel: 'text-embedding-3-small',
    generativeModel: 'gemini-2.0-flash',
};

export function validateConfig() {
    if (!config.googleApiKey && !config.openaiApiKey && !config.minimaxApiKey && !config.openrouterApiKey) {
        throw new Error("At least one LLM provider API key (GOOGLE_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY, or OPENROUTER_API_KEY) must be set in the .env file.");
    }
}
