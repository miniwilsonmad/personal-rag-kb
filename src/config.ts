
import dotenv from 'dotenv';
import path from 'path';

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.resolve(projectRoot, '.env');
dotenv.config({ path: envPath, override: true });

export const config = {
    googleApiKey: process.env.GOOGLE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    transcriptApiKey: process.env.TRANSCRIPT_API_KEY,
    
    // Minimax Configuration
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    minimaxGroupId: process.env.MINIMAX_GROUP_ID,

    dbPath: process.env.DB_PATH || './knowledge_base.db',
    chromaCollectionName: process.env.CHROMA_COLLECTION_NAME || 'knowledge_base',

    primaryEmbeddingModel: 'embedding-001',
    fallbackEmbeddingModel: 'text-embedding-3-small',
    generativeModel: 'gemini-2.0-flash',
};

export function validateConfig() {
    if (!config.googleApiKey && !config.minimaxApiKey) {
        throw new Error("At least one LLM provider API key (GOOGLE_API_KEY or MINIMAX_API_KEY) must be set in the .env file.");
    }
}
