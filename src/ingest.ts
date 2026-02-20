
import { getDbConnection, initializeSchema, getAllUniqueTags } from './database';
import { ingestFromSource, ExtractedContent } from './extractor';
import { classifyContent } from './classifier';
import { chunkContent, embedChunks, EmbeddedChunk } from './embedder';
import { addChunksToVectorStore } from './vector-store';
import * as fs from 'fs';
import * as path from 'path';

export interface IngestResult {
    success: boolean;
    source: string;
    targets?: string[];
    tags?: string[];
    chunks?: number;
    error?: string;
}

// Global lock file for the ingestion process itself
const LOCK_FILE_PATH = path.join(__dirname, '../ingest.lock');

// --- Configuration for Targets ---
interface TargetConfig {
    repoPath: string;
    dbPath: string;
    collectionName: string;
}

const TARGETS: Record<string, TargetConfig> = {
    'pablo': {
        repoPath: path.resolve(__dirname, '../../personal-rag-kb-storage'),
        dbPath: path.resolve(__dirname, '../../personal-rag-kb-storage/knowledge_base.db'),
        collectionName: 'pablo_kb'
    },
    'paloma': {
        repoPath: path.resolve(__dirname, '../../paloma-rag-kb-storage'),
        dbPath: path.resolve(__dirname, '../../paloma-rag-kb-storage/knowledge_base.db'),
        collectionName: 'paloma_kb'
    },
    'reels': {
        repoPath: path.resolve(__dirname, '../../instagram-reels-storage'),
        dbPath: path.resolve(__dirname, '../../instagram-reels-storage/knowledge_base.db'),
        collectionName: 'reels_kb'
    }
};

function isLockStale(): boolean {
    if (!fs.existsSync(LOCK_FILE_PATH)) return false;
    const stats = fs.statSync(LOCK_FILE_PATH);
    if (new Date().getTime() - stats.mtime.getTime() > (15 * 60 * 1000)) return true;
    try {
        const pid = parseInt(fs.readFileSync(LOCK_FILE_PATH, 'utf8'), 10);
        process.kill(pid, 0);
        return false;
    } catch (e) {
        return true;
    }
}

function createLock(): void {
    if (!isLockStale() && fs.existsSync(LOCK_FILE_PATH)) {
        throw new Error('Ingestion is already running. Lock file exists.');
    }
    fs.writeFileSync(LOCK_FILE_PATH, process.pid.toString(), 'utf8');
}

function removeLock(): void {
    if (fs.existsSync(LOCK_FILE_PATH)) fs.unlinkSync(LOCK_FILE_PATH);
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9_\-\.]/gi, '_').substring(0, 100);
}

export async function ingestSource(source: string, tags: string[] = [], targetKeys: string[] = ['pablo']): Promise<IngestResult> {
    if (!source) {
        const errorMsg = "A source URL or file path is required.";
        console.error(errorMsg);
        return { success: false, source, error: errorMsg };
    }

    try {
        createLock();

        console.error(`Processing source: ${source}`);
        console.error(`Targets: ${targetKeys.join(', ')}`);

        // 1. Extraction (Done once for all targets)
        let extractedContent: ExtractedContent;
        try {
            extractedContent = await ingestFromSource(source);
        } catch (error: any) {
            console.error('Extraction failed:', error.message);
            return { success: false, source, error: `Extraction failed: ${error.message}` };
        }

        // 1.5 Classification (Auto-Tagging)
        console.error('Fetching existing topics and classifying content...');
        const refTarget = TARGETS['reels'] || TARGETS[targetKeys[0]];
        const existingTags = await getAllUniqueTags(refTarget.dbPath);
        
        let classificationTags: string[] = [];
        let newClassificationTags: string[] = [];
        let classificationReasoning: string = "";

        try {
            const classification = await classifyContent(extractedContent.content, existingTags);
            classificationTags = classification.tags;
            newClassificationTags = classification.newTags;
            classificationReasoning = classification.reasoning;
        } catch (error: any) {
            console.error("AI Classification failed, proceeding with manual tags only:", error.message);
            // This is non-fatal, so we proceed with just the manual tags
        }

        const finalTags = Array.from(new Set([...tags, ...classificationTags])); // Merge manual + auto tags
        
        console.error(`AI Classification:\n- Assigned Topics: ${finalTags.join(', ')}\n- New Topics Created: ${newClassificationTags.join(', ') || 'None'}\n- Reasoning: ${classificationReasoning}\n`);

        // 2. Embedding (Done once for all targets)
        console.error('Chunking and embedding content...');
        const chunks = chunkContent(extractedContent.content);
        let embeddedChunks: EmbeddedChunk[] = [];
        try {
            embeddedChunks = await embedChunks(chunks);
        } catch (error: any) {
            console.error("Embedding failed:", error.message);
            return { success: false, source, error: `Embedding failed: ${error.message}` };
        }
        
        if (embeddedChunks.length === 0) {
            console.error('No chunks were embedded. Halting.');
            return { success: false, source, error: "No chunks were embedded." };
        }

        // 3. Process each target
        const successfullyIngestedTargets: string[] = [];
        for (const targetKey of targetKeys) {
            const target = TARGETS[targetKey];
            if (!target) {
                console.error(`Unknown target: ${targetKey}. Skipping.`);
                continue;
            }

            console.error(`\n--- Ingesting into target: ${targetKey} ---`);
            
            if (!fs.existsSync(target.repoPath)) {
                console.error(`Target repository not found at ${target.repoPath}. Skipping.`);
                continue;
            }

            await initializeSchema(target.dbPath);
            const db = await getDbConnection(target.dbPath);

            const existingBySource = await db.get('SELECT id FROM sources WHERE normalized_url = ?', extractedContent.normalizedSource);
            if (existingBySource) {
                console.error(`Source already exists in target ${targetKey}. Skipping.`);
                successfullyIngestedTargets.push(targetKey); // Consider it success if already exists
                continue;
            }

            let sourceId: number | undefined;
            const insertedChunkIds: number[] = [];

            try {
                await db.run('BEGIN TRANSACTION;');
                const sourceInsert = await db.run(
                    'INSERT INTO sources (url, normalized_url, title, source_type, raw_content, content_hash, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    extractedContent.source, extractedContent.normalizedSource, extractedContent.title, extractedContent.sourceType, extractedContent.content, extractedContent.contentHash, JSON.stringify(finalTags)
                );
                sourceId = sourceInsert.lastID;
                if (!sourceId) throw new Error("Failed to get last inserted source ID.");

                const stmt = await db.prepare('INSERT INTO chunks (source_id, chunk_index, content) VALUES (?, ?, ?)');
                for (const chunk of embeddedChunks) {
                    const chunkInsert = await stmt.run(sourceId, chunk.chunk_index, chunk.content);
                    if (chunkInsert.lastID) insertedChunkIds.push(chunkInsert.lastID);
                }
                await stmt.finalize();
                await db.run('COMMIT;');
                console.error(`Successfully saved metadata to SQLite (${targetKey}).`);
            } catch (error: any) {
                await db.run('ROLLBACK;');
                console.error(`Database transaction failed for ${targetKey}:`, error.message);
                continue;
            }

            try {
                const chunksWithIds = embeddedChunks.map((chunk, index) => ({ 
                    id: insertedChunkIds[index], 
                    source_id: sourceId!, 
                    content: chunk.content, 
                    url: extractedContent.source, 
                    title: extractedContent.title, 
                    tags: finalTags 
                }));
                const embeddings = embeddedChunks.map(chunk => chunk.embedding);
                await addChunksToVectorStore(target.collectionName, chunksWithIds, embeddings);
                console.error(`Successfully saved vectors to ChromaDB collection '${target.collectionName}'.`);
            } catch(error: any) {
                console.error(`Failed to add to vector store for ${targetKey}:`, error.message);
                continue;
            }

            if (sourceId) {
                try {
                    const date = new Date();
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const dateDir = `${year}-${month}`;

                    const sourceTypeDir = extractedContent.sourceType.charAt(0).toUpperCase() + extractedContent.sourceType.slice(1);
                    const storageDir = path.join(target.repoPath, sourceTypeDir, dateDir);
                    fs.mkdirSync(storageDir, { recursive: true });

                    const sanitizedTitle = sanitizeFilename(extractedContent.title);
                    const filename = `${sourceId}-${sanitizedTitle}${extractedContent.fileExtension}`;
                    const filePath = path.join(storageDir, filename);

                    if (['pdf', 'text'].includes(extractedContent.sourceType) && fs.existsSync(extractedContent.source)) {
                        fs.copyFileSync(extractedContent.source, filePath);
                    } else {
                        fs.writeFileSync(filePath, extractedContent.originalContent);
                    }
                    console.error(`Successfully archived file to ${filePath}`);
                    successfullyIngestedTargets.push(targetKey);
                } catch (error: any) {
                    console.error(`Failed to save original file artifact for ${targetKey}:`, error.message);
                    continue;
                }
            }
        }
        return { success: successfullyIngestedTargets.length > 0, source, targets: successfullyIngestedTargets, tags: finalTags, chunks: embeddedChunks.length };

    } catch (error: any) {
        console.error("An error occurred during ingestion:", error.message);
        return { success: false, source, error: `An unexpected error occurred during ingestion: ${error.message}` };
    } finally {
        removeLock();
    }
}
