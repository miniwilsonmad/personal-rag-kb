
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from 'openai';
import axios from 'axios';
import { config } from './config';

const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

// Initialize Gemini if key is present
const genAI = config.googleApiKey ? new GoogleGenerativeAI(config.googleApiKey) : null;

export interface LLMResponse {
    text: string;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/**
 * Generates text using the configured LLM provider hierarchy.
 * Priority: Gemini -> OpenAI -> Minimax -> OpenRouter
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

    // 2. Fallback to OpenAI
    if (openai && config.openaiApiKey) {
        try {
            console.error("Using OpenAI for generation...");
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages,
            });
            const text = completion.choices[0]?.message?.content;
            if (text) return text;
        } catch (error) {
            console.warn("OpenAI generation failed:", (error as Error).message);
        }
    }

    // 3. Fallback to Minimax
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
                model: config.minimaxChatModel || "MiniMax-M2.5", // Coding Plan / text models
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

    // 4. Fallback to OpenRouter (free models)
    if (config.openrouterApiKey) {
        try {
            console.error("Using OpenRouter for generation...");
            const messages: { role: string; content: string }[] = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });
            const response = await axios.post(
                `${OPENROUTER_BASE}/chat/completions`,
                {
                    model: config.openrouterChatModel,
                    messages,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.openrouterApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/pablomadrigal/personal-rag-kb',
                    },
                }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (text) return text;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.warn("OpenRouter generation failed:", error.response?.status, JSON.stringify(error.response?.data || {}), (error as Error).message);
            } else {
                console.warn("OpenRouter generation failed:", (error as Error).message);
            }
        }
    }

    throw new Error("All LLM providers (Gemini, OpenAI, Minimax, OpenRouter) failed. Please check your API keys.");
}

/**
 * Generates embeddings using the configured LLM provider hierarchy.
 * Priority: Gemini -> OpenAI -> Minimax -> OpenRouter
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

    // 2. Fallback to OpenAI embeddings
    if (openai && config.openaiApiKey) {
        try {
            console.error("Using OpenAI for embeddings...");
            const response = await openai.embeddings.create({
                model: config.fallbackEmbeddingModel || "text-embedding-3-small",
                input: texts,
            });
            if (response.data?.length === texts.length) {
                return response.data.map((d) => d.embedding);
            }
        } catch (error) {
            console.warn("OpenAI embeddings failed:", (error as Error).message);
        }
    }

    // 3. Fallback to Minimax
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

    // 4. Fallback to OpenRouter embeddings
    if (config.openrouterApiKey) {
        try {
            console.error("Using OpenRouter for embeddings...");
            const response = await axios.post(
                `${OPENROUTER_BASE}/embeddings`,
                {
                    model: config.openrouterEmbeddingModel,
                    input: texts,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${config.openrouterApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/pablomadrigal/personal-rag-kb',
                    },
                }
            );
            if (response.data?.data?.length === texts.length) {
                return response.data.data.map((d: { embedding: number[] }) => d.embedding);
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.warn("OpenRouter embeddings failed:", error.response?.status, JSON.stringify(error.response?.data || {}), (error as Error).message);
            } else {
                console.warn("OpenRouter embeddings failed:", (error as Error).message);
            }
        }
    }

    throw new Error("All Embedding providers failed.");
}
