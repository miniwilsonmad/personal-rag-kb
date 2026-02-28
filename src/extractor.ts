
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import pdfParse from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { URL } from 'url';
import { config } from './config';

export interface ExtractedContent {
    title: string;
    content: string;
    originalContent: string; // The raw content before any processing (e.g., HTML, PDF text)
    sourceType: SourceType;
    fileExtension: string;
    source: string; // Original URL or file path
    normalizedSource: string; // Normalized URL or absolute file path
    contentHash: string;
}

export type SourceType = 'article' | 'video' | 'pdf' | 'text' | 'tweet' | 'reel' | 'other';

/** Schema for Instagram-reels-rag pipeline output (downloader + transcription + OCR). */
export interface DownloaderOutputJson {
    reelId?: string;
    url: string;
    author?: string;
    description?: string | null;
    duration?: number;
    transcription?: string | null;
    transcriptionProvider?: string | null;
    ocrText?: string | null;
}

function isDownloaderOutputJson(obj: unknown): obj is DownloaderOutputJson {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    if (typeof o.url !== 'string') return false;
    const hasContent =
        (o.description != null && String(o.description).trim().length > 0) ||
        (o.transcription != null && String(o.transcription).trim().length > 0) ||
        (o.ocrText != null && String(o.ocrText).trim().length > 0);
    return hasContent;
}

/**
 * Extracts ExtractedContent from an Instagram-reels-rag JSON output file.
 */
async function extractFromDownloaderJson(filePath: string): Promise<ExtractedContent> {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isDownloaderOutputJson(parsed)) {
        throw new Error('JSON does not match Instagram-reels-rag output schema (requires url and at least one of description, transcription, ocrText).');
    }
    const data = parsed as DownloaderOutputJson;

    const title = data.author
        ? `${data.author} - ${data.reelId || 'video'}`
        : (data.reelId || path.basename(filePath, '.json'));

    const sections: string[] = [];
    if (data.description?.trim()) sections.push(`# Caption / Description\n\n${data.description.trim()}`);
    if (data.transcription?.trim()) sections.push(`# Transcription\n\n${data.transcription.trim()}`);
    if (data.ocrText?.trim()) sections.push(`# OCR Text\n\n${data.ocrText.trim()}`);
    const content = sections.join('\n\n');
    if (content.trim().length === 0) {
        throw new Error('Downloader JSON has no extractable content (description, transcription, or ocrText).');
    }

    const sourceType: SourceType = data.url.includes('youtube.com') || data.url.includes('youtu.be')
        ? 'video'
        : 'reel';

    return {
        title,
        content,
        originalContent: raw,
        sourceType,
        fileExtension: '.json',
        source: data.url,
        normalizedSource: normalizeSource(data.url, sourceType),
        contentHash: hashContent(content),
    };
}

/**
 * Detects the source type based on the input string (URL or file path).
 */
export function detectSourceType(source: string): SourceType {
    try {
        const url = new URL(source);
        if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
            return 'video';
        }
        if (url.hostname.includes('twitter.com') || url.hostname.includes('x.com')) {
            return 'tweet';
        }
        if (url.hostname.includes('instagram.com')) {
            // Further checks can be done inside extractReel if needed
            return 'reel';
        }
        if (url.pathname.toLowerCase().endsWith('.pdf')) {
            return 'pdf';
        }
        // Default to article for other URLs
        return 'article';
    } catch (e) {
        // Not a URL, check if it's a local file
        if (fs.existsSync(source)) {
            const stats = fs.statSync(source);
            if (stats.isFile()) {
                const ext = path.extname(source).toLowerCase();
                if (ext === '.pdf') return 'pdf';
                // Consider .txt, .md, etc., as text files
                if (['.txt', '.md'].includes(ext)) return 'text';
            }
        }
        return 'other';
    }
}

/**
 * Normalizes the source URL or file path.
 * - Strips fragments and most query parameters from URLs.
 * - For YouTube, keeps only the 'v' parameter.
 * - Resolves local paths to absolute paths.
 */
export function normalizeSource(source: string, sourceType: SourceType): string {
    try {
        const url = new URL(source);
        let normalizedUrl = url.origin + url.pathname;

        if (sourceType === 'video' && (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be'))) {
            const videoId = url.searchParams.get('v');
            return videoId ? `https://www.youtube.com/watch?v=${videoId}` : normalizedUrl;
        }

        // For other URLs, remove common tracking params and fragments
        const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'gclid'];
        paramsToRemove.forEach(param => url.searchParams.delete(param));
        
        url.hash = ''; // Remove fragment

        return url.toString();
    } catch (e) {
        // Not a URL, assume it's a file path
        return path.resolve(source);
    }
}

/**
 * Generates a SHA256 hash of the content.
 */
export function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extracts content from an article URL using JSDOM and Readability.
 */
async function extractArticle(url: string): Promise<ExtractedContent> {
    const response = await axios.get(url);
    const html = response.data;
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
        // Fallback to body text if Readability fails
        const bodyText = dom.window.document.body.textContent || '';
        if (bodyText.trim().length === 0) {
            throw new Error('Could not extract meaningful content from article.');
        }
        return {
            title: dom.window.document.title || 'Untitled Article',
            content: bodyText,
            originalContent: html,
            sourceType: 'article',
            fileExtension: '.html',
            source: url,
            normalizedSource: normalizeSource(url, 'article'),
            contentHash: hashContent(bodyText)
        };
    }

    return {
        title: article.title,
        content: article.textContent,
        originalContent: html,
        sourceType: 'article',
        fileExtension: '.html',
        source: url,
        normalizedSource: normalizeSource(url, 'article'),
        contentHash: hashContent(article.textContent)
    };
}

/**
 * Extracts text from a PDF file (local or remote).
 */
async function extractPdf(source: string): Promise<ExtractedContent> {
    let pdfBuffer: Buffer;
    let originalFilename: string = 'document.pdf';

    try {
        const url = new URL(source);
        // Remote PDF
        const response = await axios.get(url.toString(), { responseType: 'arraybuffer' });
        pdfBuffer = Buffer.from(response.data);
        originalFilename = path.basename(url.pathname);
    } catch (e) {
        // Local PDF
        pdfBuffer = fs.readFileSync(source);
        originalFilename = path.basename(source);
    }

    const data = await pdfParse(pdfBuffer);
    if (!data || !data.text || data.text.trim().length === 0) {
        throw new Error('Could not extract text from PDF.');
    }

    return {
        title: data.info?.Title || originalFilename,
        content: data.text,
        originalContent: data.text, // PDF text is already the processed content
        sourceType: 'pdf',
        fileExtension: '.pdf',
        source: source,
        normalizedSource: normalizeSource(source, 'pdf'),
        contentHash: hashContent(data.text)
    };
}

/**
 * Extracts transcript from a YouTube video using transcriptapi.com.
 */
async function extractYouTubeVideo(url: string): Promise<ExtractedContent> {
    if (!config.transcriptApiKey) {
        throw new Error('TRANSCRIPT_API_KEY is not set in .env for YouTube extraction.');
    }

    const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11}).*/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (!videoId) {
        throw new Error('Could not extract video ID from YouTube URL.');
    }

    const apiUrl = `https://api.transcriptapi.com/v1/transcript?url=${encodeURIComponent(url)}`;
    const headers = { 'X-API-KEY': config.transcriptApiKey };

    const response = await axios.get(apiUrl, { headers });
    const transcriptData = response.data;

    if (!transcriptData || !transcriptData.transcript || transcriptData.transcript.length === 0) {
        throw new Error('Could not retrieve transcript from YouTube video.');
    }

    const fullTranscript = transcriptData.transcript.map((item: any) => item.text).join(' ');

    return {
        title: transcriptData.title || 'YouTube Video Transcript',
        content: fullTranscript,
        originalContent: JSON.stringify(transcriptData),
        sourceType: 'video',
        fileExtension: '.json', // Storing raw transcript JSON as original content
        source: url,
        normalizedSource: normalizeSource(url, 'video'),
        contentHash: hashContent(fullTranscript)
    };
}

/**
 * Extracts content from a Tweet using Twitter oembed API.
 */
async function extractTweet(url: string): Promise<ExtractedContent> {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await axios.get(oembedUrl);
    const oembedData = response.data;

    if (!oembedData || !oembedData.html) {
        throw new Error('Could not retrieve oembed data for Tweet.');
    }

    // Use JSDOM to parse the HTML and extract text content
    const dom = new JSDOM(oembedData.html);
    const tweetTextElement = dom.window.document.querySelector('.twitter-tweet-rendered .Tweet-text');
    const tweetText = tweetTextElement ? tweetTextElement.textContent : dom.window.document.body.textContent; // Fallback

    if (!tweetText || tweetText.trim().length === 0) {
        throw new Error('Could not extract text from Tweet.');
    }

    // The oembed API does not directly give a title, so we might derive one or use a placeholder
    const title = `Tweet by ${oembedData.author_name || 'Unknown'}`;

    return {
        title: title,
        content: tweetText.trim(),
        originalContent: oembedData.html,
        sourceType: 'tweet',
        fileExtension: '.html',
        source: url,
        normalizedSource: normalizeSource(url, 'tweet'),
        contentHash: hashContent(tweetText.trim())
    };
}

/**
 * Extracts content from an Instagram Reel by fetching HTML and parsing OpenGraph meta tags.
 */
async function extractReel(url: string): Promise<ExtractedContent> {
    const response = await axios.get(url);
    const html = response.data;
    const dom = new JSDOM(html);

    const ogTitle = dom.window.document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const ogDescription = dom.window.document.querySelector('meta[property="og:description"]')?.getAttribute('content');
    const ogVideo = dom.window.document.querySelector('meta[property="og:video"]')?.getAttribute('content');

    const title = ogTitle || `Instagram Reel: ${url}`;
    let content = '';

    if (ogDescription) {
        content += ogDescription;
    }
    // You could potentially try to get more text from the page if needed, but for Reels, description is often key.
    if (content.trim().length === 0) {
        // Fallback to a simpler title if no description
        content = title;
    }
    
    if (content.trim().length === 0) {
        throw new Error('Could not extract meaningful content from Instagram Reel.');
    }

    return {
        title: title,
        content: content.trim(),
        originalContent: html,
        sourceType: 'reel',
        fileExtension: '.html',
        source: url,
        normalizedSource: normalizeSource(url, 'reel'),
        contentHash: hashContent(content.trim())
    };
}

/**
 * Extracts content from a local text file.
 */
async function extractTextFile(filePath: string): Promise<ExtractedContent> {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.trim().length === 0) {
        throw new Error('Text file is empty or contains no meaningful content.');
    }
    return {
        title: path.basename(filePath),
        content: content,
        originalContent: content,
        sourceType: 'text',
        fileExtension: path.extname(filePath),
        source: filePath,
        normalizedSource: normalizeSource(filePath, 'text'),
        contentHash: hashContent(content)
    };
}

/**
 * Main ingestion function, orchestrates extraction based on source type.
 */
export async function ingestFromSource(source: string): Promise<ExtractedContent> {
    // Check for Instagram-reels-rag downloader JSON output first
    if (path.extname(source).toLowerCase() === '.json' && fs.existsSync(source)) {
        try {
            const raw = fs.readFileSync(source, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            if (isDownloaderOutputJson(parsed)) {
                console.error(`Detected source type: downloader-json for ${source}`);
                return await extractFromDownloaderJson(source);
            }
        } catch {
            // Not valid JSON or schema mismatch; fall through to normal detection
        }
    }

    const sourceType = detectSourceType(source);
    console.error(`Detected source type: ${sourceType} for ${source}`);

    switch (sourceType) {
        case 'article':
            return await extractArticle(source);
        case 'pdf':
            return await extractPdf(source);
        case 'video': // YouTube
            return await extractYouTubeVideo(source);
        case 'tweet':
            return await extractTweet(source);
        case 'reel': // Instagram Reel
            return await extractReel(source);
        case 'text':
            return await extractTextFile(source);
        case 'other':
        default:
            throw new Error(`Unsupported source type or invalid source: ${source}`);
    }
}
