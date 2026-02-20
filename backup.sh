#!/bin/bash

# --- Configuration ---
PROJECT_ROOT="/home/pablo-madrigal/.openclaw/workspace/personal-rag-kb"
BACKUP_DIR="/home/pablo-madrigal/.openclaw/workspace/personal-rag-kb-backups"

# Source configuration from ingest.ts to get target paths (requires parsing)
# For simplicity, we'll hardcode the known paths based on CLAUDE.md for now
# In a more complex scenario, a Node.js script could dynamically read TARGETS from ingest.ts
TARGET_STORAGE_PATHS=(
    "/home/pablo-madrigal/.openclaw/workspace/personal-rag-kb-storage"
    "/home/pablo-madrigal/.openclaw/workspace/paloma-rag-kb-storage"
    "/home/pablo-madrigal/.openclaw/workspace/instagram-reels-storage"
    "/var/lib/docker/volumes/personal-rag-kb-chroma-data/_data"
)

# SQLite DB paths (derived from TARGET_STORAGE_PATHS)
# Assumes DB is named knowledge_base.db within each storage repo
SQLITE_DB_FILES=(
    "/home/pablo-madrigal/.openclaw/workspace/personal-rag-kb-storage/knowledge_base.db"
    "/home/pablo-madrigal/.openclaw/workspace/paloma-rag-kb-storage/knowledge_base.db"
    "/home/pablo-madrigal/.openclaw/workspace/instagram-reels-storage/knowledge_base.db"
)

# --- Script Logic ---

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
ARCHIVE_NAME="personal-rag-kb-backup-${TIMESTAMP}.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "$(date): Starting backup..."

mkdir -p "$BACKUP_DIR" || { echo "Error: Could not create backup directory $BACKUP_DIR"; exit 1; }

# Ensure the backup script is executable
chmod +x "$PROJECT_ROOT/backup.sh" || { echo "Error: Could not make backup script executable"; exit 1; }

# Files and directories to include in the backup archive
BACKUP_ITEMS=(
    "$PROJECT_ROOT/dist"
    "$PROJECT_ROOT/package.json"
    "$PROJECT_ROOT/package-lock.json"
    "$PROJECT_ROOT/tsconfig.json"
    "$PROJECT_ROOT/.env"
    "$PROJECT_ROOT/CLAUDE.md"
)

# Add target storage paths if they exist
for target_path in "${TARGET_STORAGE_PATHS[@]}"; do
    if [ -d "$target_path" ]; then
        BACKUP_ITEMS+=("$target_path")
        echo "Including storage path: $target_path"
    else
        echo "Warning: Storage path not found, skipping: $target_path"
    fi
done

# Add SQLite DB files if they exist
for db_file in "${SQLITE_DB_FILES[@]}"; do
    if [ -f "$db_file" ]; then
        BACKUP_ITEMS+=("$db_file")
        echo "Including database file: $db_file"
    else
        echo "Warning: Database file not found, skipping: $db_file"
    fi
done

# Perform the backup
tar -czvf "$BACKUP_DIR/$ARCHIVE_NAME" -C "/" "${BACKUP_ITEMS[@]///}" || { echo "Error: Tar command failed."; exit 1; }

echo "$(date): Backup complete: $BACKUP_DIR/$ARCHIVE_NAME"

# --- ChromaDB Backup Consideration ---
echo ""
echo "IMPORTANT: ChromaDB data is managed by Docker volumes."
echo "For robust backups, ensure your ChromaDB Docker container uses a named volume or bind-mounts its data to a host directory."
echo "If using an anonymous volume, you would need to use 'docker cp' to extract data, which is not ideal for automated backups."
echo "Consider adding '-v personal-rag-kb-chroma-data:/chroma/data' to your 'docker run' command for better data persistence and backup."

# Example of how to add a named volume for ChromaDB (run this if you want persistent data):
# docker run -d -p 8000:8000 -v personal-rag-kb-chroma-data:/chroma/data chromadb/chroma
