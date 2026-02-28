/**
 * Tests downloader JSON extraction (no DB/ChromaDB/LLM).
 * Run: node scripts/test-downloader-flow.mjs
 * Requires: pnpm run build first
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const distPath = path.join(root, 'dist', 'extractor.js');
if (!fs.existsSync(distPath)) {
  console.error('Run "pnpm run build" first.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const { ingestFromSource } = require(distPath);

const outputDir = path.join(root, 'Instagram-reels-rag', 'output');
const testFile = path.join(outputDir, 'test-reel.json');

console.log('=== Test 1: Single JSON file extraction ===');
if (!fs.existsSync(testFile)) {
  console.error('Missing test file. Create output with sample JSON first.');
  process.exit(1);
}

const extracted = await ingestFromSource(testFile);
console.log('Title:', extracted.title);
console.log('Source:', extracted.source);
console.log('SourceType:', extracted.sourceType);
console.log('Content length:', extracted.content.length);
console.log('Content preview:', extracted.content.substring(0, 120) + '...');
console.log('OK\n');

console.log('=== Test 2: Directory structure ===');
const jsonFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.json'));
console.log('JSON files in output dir:', jsonFiles);
console.log('OK\n');

console.log('=== All extractor tests passed ===');
