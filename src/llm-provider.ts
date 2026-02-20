
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import { config } from './config';

// Initialize Gemini if key is present
const genAI = config.googleApiKey ? new GoogleGenerativeAI(config.googleApiKey) : null;

export interface LLMResponse {
    text: string;
}

/**
 * Generates text using the configured LLM provider hierarchy.
 * Priority: Gemini -> Minimax
 */
export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
    // 1. Try Gemini
    if (genAI && config.googleApiKey) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: config.generativeModel || "gemini-2.5-flash-lite",
                systemInstruction: systemInstruction 
            });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.warn("Gemini generation failed, trying fallback...", (error as Error).message);
        }
    }

    // 2. Fallback to Minimax
    if (config.minimaxApiKey) {
        try {
            console.error("Using Minimax for generation...");
            const url = `https://api.minimax.io/v1/text/chatcompletion_v2?GroupId=${config.minimaxGroupId || ''}`;
            
            const messages = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });

            const response = await axios.post(url, {
                model: "abab6.5s-chat", // Efficient Minimax model
                messages: messages,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${config.minimaxApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response && response.data && response.data.choices) {
                return response.data.choices[0].message.content;
            } else {
                throw new Error("Minimax response structure unexpected: " + (response ? JSON.stringify(response.data) : "Empty response"));
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error("Minimax Axios Error:", error.response?.status, JSON.stringify(error.response?.data));
            } else {
                console.error("Minimax generation failed:", (error as Error).message);
            }
        }
    }

    throw new Error("All LLM providers failed. Please check your API keys.");
}

/**
 * Generates embeddings using the configured LLM provider hierarchy.
 * Priority: Gemini -> Minimax
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    // 1. Try Gemini via REST API
    if (config.googleApiKey) {
        try {
            const embeddings: number[][] = [];
            for (const text of texts) {
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${config.googleApiKey}`,
                    { content: { role: "user", parts: [{ text }] } },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                if (response.data.embedding?.values) {
                    embeddings.push(response.data.embedding.values);
                } else {
                    throw new Error("Unexpected Gemini embedding response structure");
                }
            }
            return embeddings;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.warn("Gemini embeddings failed, trying fallback...", error.response?.status, (error as Error).message);
            } else {
                console.warn("Gemini embeddings failed, trying fallback...", (error as Error).message);
            }
        }
    }

    // 2. Fallback to Minimax
    if (config.minimaxApiKey) {
        try {
            console.error("Using Minimax for embeddings...");
            const url = `https://api.minimax.io/v1/embeddings?GroupId=${config.minimaxGroupId || ''}`;
            
            const response = await axios.post(url, {
                model: "embo-01",
                texts: texts,
                type: "db"
            }, {
                headers: {
                    'Authorization': `Bearer ${config.minimaxApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response && response.data && response.data.vectors) {
                return response.data.vectors;
            } else {
                throw new Error("Minimax embedding response structure unexpected: " + (response ? JSON.stringify(response.data) : "Empty response"));
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error("Minimax Embedding Axios Error:", error.response?.status, JSON.stringify(error.response?.data));
            } else {
                console.error("Minimax embeddings failed:", (error as Error).message);
            }
        }
    }

    throw new Error("All Embedding providers failed.");
}
