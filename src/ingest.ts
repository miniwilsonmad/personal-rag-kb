
import { getDbConnection } from './database';
import { ingestFromSource } from './extractor';
import { chunkContent, embedChunks } from './embedder';
import { addChunksToVectorStore } from './vector-store';
import * as fs from 'fs';
import * as path from 'path';

// ... (Lock file management functions remain the same) ...

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9_\-\.]/gi, '_').substring(0, 100);
}

export async function ingestSource(source: string, tags: string[] = []) {
    // ... (Initial setup, locking, and extraction are the same) ...
    try {
        createLock();
        const extracted = await ingestFromSource(source);
        if (!extracted) { /* handle error */ return; }
        
        const db = await getDbConnection();
        // ... (Deduplication checks are the same) ...

        const embeddedChunks = await embedChunks(chunkContent(extracted.content));
        // ... (Handle embedding failure) ...
        
        let sourceId: number | undefined;
        // ... (Database transaction to save source and chunks is the same) ...
        // After commit...
        sourceId = sourceInsert.lastID;

        // --- New Archival Logic ---
        if (sourceId) {
            try {
                const date = new Date();
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const dateDir = `${year}-${month}`;

                const sourceTypeDir = extracted.sourceType.charAt(0).toUpperCase() + extracted.sourceType.slice(1);
                const storageDir = path.join(__dirname, `../storage/${sourceTypeDir}/${dateDir}`);
                fs.mkdirSync(storageDir, { recursive: true });

                let fileExtension = '.txt';
                switch(extracted.sourceType) {
                    case 'article': fileExtension = '.html'; break;
                    case 'pdf': fileExtension = '.pdf'; break;
                    case 'tweet': fileExtension = '.json'; break;
                }

                const sanitizedTitle = sanitizeFilename(extracted.title);
                const filename = `${sourceId}-${sanitizedTitle}${extracted.fileExtension}`;
                const filePath = path.join(storageDir, filename);

                if (extracted.sourceType === 'pdf' || extracted.sourceType === 'text') {
                    // For local files, copy the original to the archive
                    fs.copyFileSync(extracted.source, filePath);
                } else {
                    // For web content, write the fetched original content
                    fs.writeFileSync(filePath, extracted.originalContent);
                }
                console.log(`Successfully archived original file to ${filePath}`);

            } catch (error) {
                console.error("Failed to save original file artifact:", error);
            }
        }
        
    } catch (error) {
        console.error("An error occurred during ingestion:", error);
    } finally {
        removeLock();
    }
}
