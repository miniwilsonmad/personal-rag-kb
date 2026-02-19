
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { config } from './config';
import { path as ytDlpPath } from 'yt-dlp-wrap';

const execAsync = promisify(exec);

// --- Interfaces ---
export interface ExtractedContent {
  title: string;
  content: string;
  originalContent: string | Buffer;
  sourceType: SourceType;
  fileExtension: string;
  source: string;
  normalizedSource: string;
  contentHash: string;
}
export type SourceType = 'article' | 'video' | 'pdf' | 'text' | 'tweet' | 'reel' | 'other';

// --- Type Detection ---
function detectSourceType(source: string): SourceType {
    if (fs.existsSync(source)) {
        if (source.endsWith('.pdf')) return 'pdf';
        return 'text';
    }
    try {
        const url = new URL(source);
        if (['youtube.com', 'youtu.be'].includes(url.hostname)) return 'video';
        if (['instagram.com'].includes(url.hostname) && url.pathname.includes('/reel/')) return 'reel';
        if (url.pathname.endsWith('.pdf')) return 'pdf';
        return 'article';
    } catch {
        return 'other';
    }
}

// --- Extractor Functions ---

async function extractReel(url: string): Promise<{ title: string; content: string; originalContent: Buffer; fileExtension: string } | null> {
    console.log(`Extracting Reel from: ${url}`);
    const openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
    if (!openai) {
        console.error("OpenAI API key is required for Reel transcription. Skipping.");
        return null;
    }

    let tempAudioPath: string | null = null;
    try {
        // 1. Get metadata using yt-dlp
        console.log('Fetching reel metadata with yt-dlp...');
        const { stdout } = await execAsync(`"${ytDlpPath}" --get-json "${url}"`);
        const data = JSON.parse(stdout);

        const description = data.description || '';
        const title = (data.title || 'Untitled Reel').substring(0, 100);

        // 2. Find and download best audio
        const audioFormat = data.formats?.find((f: any) => f.vcodec === 'none' && f.acodec !== 'none');
        if (!audioFormat) throw new Error("No audio-only format found.");

        console.log('Downloading audio track...');
        const audioResponse = await axios.get(audioFormat.url, { responseType: 'arraybuffer' });
        const audioBuffer = Buffer.from(audioResponse.data);
        const fileExtension = `.${audioFormat.ext}`;
        
        // 3. Transcribe audio with Whisper
        console.log('Transcribing audio with Whisper API...');
        tempAudioPath = path.join(os.tmpdir(), `reel-audio-${crypto.randomBytes(16).toString('hex')}${fileExtension}`);
        fs.writeFileSync(tempAudioPath, audioBuffer);
        
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempAudioPath),
            model: "whisper-1",
        });

        // 4. Combine and return
        const combinedContent = `${description}\n\n--- Transcripción ---\n${transcription.text}`;
        
        return {
            title,
            content: combinedContent.trim(),
            originalContent: audioBuffer,
            fileExtension,
        };

    } catch (error) {
        console.error("Failed to extract Instagram Reel:", error.message);
        return null;
    } finally {
        if (tempAudioPath) fs.unlinkSync(tempAudioPath); // Clean up temp file
    }
}

// ... (extractArticle, extractPdf, etc. would be here, also returning fileExtension)

// --- Main Ingestion Router ---
export async function ingestFromSource(source: string): Promise<ExtractedContent | null> {
    const sourceType = detectSourceType(source);
    let result: { title: string; content: string; originalContent: string | Buffer; fileExtension: string } | null = null;

    switch(sourceType) {
        case 'reel':
            result = await extractReel(source);
            break;
        // case 'article': result = await extractArticle(source); break;
        // case 'pdf': result = await extractPdf(source); break;
        default:
            console.warn(`Source type "${sourceType}" is not yet fully implemented for extraction.`);
            return null;
    }

    if (!result || !result.content) return null;

    return {
        ...result,
        sourceType,
        source,
        normalizedSource: source, // simplified
        contentHash: crypto.createHash('sha256').update(result.content).digest('hex')
    };
}
