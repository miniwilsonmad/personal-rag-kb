#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ingestSource, IngestResult } from './ingest'; 
import { answerQuery, QueryResult } from './query';   
import { validateConfig } from './config';

async function main() {
    try {
        validateConfig();
    } catch (error: any) {
        console.error(`Configuration Error: ${error.message}`);
        process.exit(1);
    }

    const argv = await yargs(hideBin(process.argv))
      .option('json', {
        describe: 'Output results in JSON format',
        type: 'boolean',
        default: false,
      })
      .command(
        'ingest <source>',
        'Ingest a new document from a URL or file path',
        (yargs: any) => {
          return yargs.positional('source', {
            describe: 'URL or local file path of the document to ingest',
            type: 'string',
          }).option('tags', {
            alias: 't',
            describe: 'Comma-separated tags for the source',
            type: 'string',
          }).option('targets', {
            describe: 'Comma-separated targets (pablo, paloma, reels)',
            type: 'string',
            default: 'pablo'
          });
        },
        async (argv: any) => {
          let result: IngestResult;
          if (argv.source) {
            const tags = argv.tags ? argv.tags.split(',').map((tag: string) => tag.trim()) : [];
            const targets = argv.targets ? argv.targets.split(',').map((target: string) => target.trim()) : ['pablo'];
            
            if (!argv.json) {
                console.error(`Starting ingestion for: ${argv.source} with tags: ${tags.join(', ')} into targets: ${targets.join(', ')}`);
            }
            result = await ingestSource(argv.source, tags, targets);
          } else {
              result = { success: false, source: argv.source || "", error: "Source not provided." };
          }

          if (argv.json) {
            console.log(JSON.stringify(result, null, 2));
          }
          process.exit(result.success ? 0 : 1);
        }
      )
      .command(
        'query <question>',
        'Ask a question to the knowledge base',
        (yargs: any) => {
          return yargs.positional('question', {
            describe: 'The question you want to ask',
            type: 'string',
          }).option('tags', {
            alias: 't',
            describe: 'Comma-separated tags to filter the search',
            type: 'string',
          }).option('target', {
            describe: 'Target knowledge base to query (e.g., pablo, paloma, reels)',
            type: 'string',
            default: 'pablo'
          });
        },
        async (argv: any) => {
          let result: QueryResult;
          if (argv.question) {
            const tags = argv.tags ? argv.tags.split(',').map((tag: string) => tag.trim()) : [];
            if (!argv.json) {
                console.error(`Starting query for: "${argv.question}" with tags: ${tags.join(', ')} from target: ${argv.target}`);
            }
            result = await answerQuery(argv.question, tags, argv.target as string);
          } else {
              result = { success: false, error: "Question not provided." };
          }

          if (argv.json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (result.success && result.answer) {
            console.error("\n--- Answer ---");
            console.error(result.answer);
            if (result.sources && result.sources.length > 0) {
                console.error("\n--- Sources ---");
                result.sources.forEach((s, i) => console.error(`${i + 1}. ${s.title} (${s.url})`));
            }
            console.error("--------------\n");
          } else if (!result.success && result.error) {
            console.error("Error:", result.error);
          }
          process.exit(result.success ? 0 : 1);
        }
      )
      .demandCommand(1, 'You need at least one command before moving on')
      .strict()
      .help()
      .parse(); // Use .parse() instead of .argv and await it
}

main().catch(error => {
    console.error("An unexpected error occurred:", error.message);
    process.exit(1);
});