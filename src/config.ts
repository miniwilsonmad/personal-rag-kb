
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    googleApiKey: process.env.GOOGLE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    transcriptApiKey: process.env.TRANSCRIPT_API_KEY,
    dbPath: process.env.DB_PATH || './knowledge_base.db',
    chromaCollectionName: process.env.CHROMA_COLLECTION_NAME || 'knowledge_base',

    // Embedding Model Configuration
    primaryEmbeddingModel: 'embedding-001', // Google
    fallbackEmbeddingModel: 'text-embedding-3-small', // OpenAI
    
    // LLM for Query Synthesis
    generativeModel: 'gemini-pro',
};

// Validate that required environment variables are set
if (!config.googleApiKey) {
    throw new Error("GOOGLE_API_KEY environment variable not set.");
}
