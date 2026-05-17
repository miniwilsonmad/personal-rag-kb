
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import axios from 'axios';
import { config } from './config';

const genAI = config.googleApiKey ? new GoogleGenerativeAI(config.googleApiKey) : null;
const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

// OpenCode Go (OpenAI-compatible cloud)
const OPENCODE_API_KEY = process.env.OPENCODE_GO_API_KEY || "";
const OPENCODE_BASE_URL = "https://opencode.ai/zen/go/v1";
const OPENCODE_GEN_MODEL = process.env.OPENCODE_GEN_MODEL || "qwen3.6-plus";
const opencode = OPENCODE_API_KEY ? new OpenAI({ apiKey: OPENCODE_API_KEY, baseURL: OPENCODE_BASE_URL }) : null;

// Ollama (local)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const OLLAMA_GEN_MODEL = process.env.OLLAMA_GEN_MODEL || "qwen2.5:3b";

export interface LLMResponse {
    text: string;
}

/**
 * Text generation: OpenCode Go -> OpenAI -> Ollama -> Gemini -> Minimax
 */
export async function generateText(prompt: string, systemInstruction?: string): Promise<string> {
    // 1. OpenCode Go (cloud, OpenAI-compatible)
    if (opencode && OPENCODE_API_KEY) {
        try {
            console.error("Using OpenCode Go for generation...");
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });

            const response = await opencode.chat.completions.create({
                model: OPENCODE_GEN_MODEL,
                messages: messages,
                temperature: 0.3,
            });
            const content = response.choices[0]?.message?.content;
            if (content) return content;
            throw new Error("OpenCode Go returned empty response");
        } catch (error) {
            console.warn("OpenCode Go generation failed, trying fallback...", (error as Error).message);
        }
    }

    // 2. OpenAI
    if (openai && config.openaiApiKey) {
        try {
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: messages,
                temperature: 0.3,
            });
            const content = response.choices[0]?.message?.content;
            if (content) return content;
            throw new Error("OpenAI returned empty response");
        } catch (error) {
            console.warn("OpenAI generation failed, trying fallback...", (error as Error).message);
        }
    }

    // 3. Ollama (local)
    try {
        console.error("Using Ollama for generation...");
        const messages: { role: string; content: string }[] = [];
        if (systemInstruction) {
            messages.push({ role: "system", content: systemInstruction });
        }
        messages.push({ role: "user", content: prompt });

        const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
            model: OLLAMA_GEN_MODEL,
            messages: messages,
            stream: false,
        }, { timeout: 120000 });

        if (response.data?.message?.content) {
            return response.data.message.content;
        }
        throw new Error("Ollama returned empty response");
    } catch (error) {
        const msg = axios.isAxiosError(error) ? `${error.response?.status} ${error.code}` : (error as Error).message;
        console.warn("Ollama generation failed, trying next fallback...", msg);
    }

    // 4. Gemini
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

    // 5. Minimax
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
                model: "abab6.5s-chat",
                messages: messages,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${config.minimaxApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response?.data?.choices) {
                return response.data.choices[0].message.content;
            }
            throw new Error("Minimax response structure unexpected: " + JSON.stringify(response?.data));
        } catch (error) {
            console.error("Minimax generation failed:", axios.isAxiosError(error) ? error.response?.status : (error as Error).message);
        }
    }

    throw new Error("All LLM providers failed. Please check your API keys.");
}

/**
 * Embeddings: Ollama -> OpenAI -> Gemini -> Minimax
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
    // 1. Ollama (local) with retries
    try {
        console.error(`Using Ollama for embeddings (${texts.length} texts, model: ${OLLAMA_EMBED_MODEL})...`);
        const embeddings: number[][] = [];
        for (const text of texts) {
            let embedding: number[] | null = null;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    if (attempt > 0) {
                        console.error(`  Retry ${attempt + 1}/3 for Ollama embedding...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // delay 1s, 2s
                    }
                    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
                        model: OLLAMA_EMBED_MODEL,
                        prompt: text,
                    }, { timeout: 30000 });
                    if (response.data?.embedding && response.data.embedding.length > 0) {
                        embedding = response.data.embedding;
                        break;
                    }
                } catch (retryError) {
                    console.warn(`  Ollama embedding attempt ${attempt + 1} failed:`, (retryError as Error).message);
                }
            }
            if (embedding) {
                embeddings.push(embedding);
            } else {
                throw new Error("Ollama returned empty embedding after 3 retries");
            }
        }
        return embeddings;
    } catch (error) {
        const msg = axios.isAxiosError(error) ? `${error.response?.status} ${error.code}` : (error as Error).message;
        console.warn("Ollama embeddings failed, trying fallback...", msg);
    }

    // 2. OpenAI
    if (openai && config.openaiApiKey) {
        try {
            const response = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: texts,
            });
            return response.data.map(item => item.embedding);
        } catch (error) {
            console.warn("OpenAI embeddings failed, trying fallback...", (error as Error).message);
        }
    }

    // 3. Gemini
    if (config.googleApiKey) {
        try {
            const embeddings: number[][] = [];
            const geminiKey = config.googleApiKey as string;
            for (const text of texts) {
                const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=" + geminiKey;
                const response = await axios.post(url,
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
            console.warn("Gemini embeddings failed, trying fallback...", (error as Error).message);
        }
    }

    // 4. Minimax
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
            if (response?.data?.vectors) {
                return response.data.vectors;
            }
            throw new Error("Minimax embedding response structure unexpected: " + JSON.stringify(response?.data));
        } catch (error) {
            console.error("Minimax embeddings failed:", axios.isAxiosError(error) ? error.response?.status : (error as Error).message);
        }
    }

    throw new Error("All Embedding providers failed.");
}
