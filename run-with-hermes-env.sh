#!/bin/bash
# Wrapper to run RAG ingestion with Hermes environment
source ~/.hermes/.env
cd /home/pablo-madrigal/Repositories/personal-rag/personal-rag-kb
exec node dist/cli.js "$@"
