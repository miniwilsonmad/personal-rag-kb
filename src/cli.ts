
#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ingestSource } from './ingest'; 
import { answerQuery } from './query';   

yargs(hideBin(process.argv))
  .command(
    'ingest <source>',
    'Ingest a new document from a URL or file path',
    (yargs) => {
      return yargs.positional('source', {
        describe: 'URL or local file path of the document to ingest',
        type: 'string',
      }).option('tags', {
        alias: 't',
        describe: 'Comma-separated tags for the source',
        type: 'string',
      });
    },
    async (argv) => {
      if (argv.source) {
        const tags = argv.tags ? argv.tags.split(',').map(tag => tag.trim()) : [];
        console.log(`Starting ingestion for: ${argv.source} with tags: ${tags.join(', ')}`);
        await ingestSource(argv.source, tags);
      }
    }
  )
  .command(
    'query <question>',
    'Ask a question to the knowledge base',
    (yargs) => {
      return yargs.positional('question', {
        describe: 'The question you want to ask',
        type: 'string',
      }).option('tags', {
        alias: 't',
        describe: 'Comma-separated tags to filter the search',
        type: 'string',
      });
    },
    async (argv) => {
      if (argv.question) {
        const tags = argv.tags ? argv.tags.split(',').map(tag => tag.trim()) : [];
        await answerQuery(argv.question, tags);
      }
    }
  )
  .demandCommand(1, 'You need at least one command before moving on')
  .help()
  .argv;
