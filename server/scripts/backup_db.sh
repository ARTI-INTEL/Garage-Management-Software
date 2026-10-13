#!/usr/bin/env bash
# Backup the GMS MySQL database to ./backups with a timestamped .sql.gz file.
# Usage: ./scripts/backup_db.sh   (or add to cron: 0 2 * * * cd /path/to/server && ./scripts/backup_db.sh)
set -euo pipefail

# Load .env from the server directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$SERVER_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SERVER_DIR/.env"
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-gms_db}"
BACKUP_DIR="$SERVER_DIR/backups"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

# Strip surrounding quotes from password if present (as in .env)
DB_PASSWORD="${DB_PASSWORD%\"}"
DB_PASSWORD="${DB_PASSWORD#\"}"

MYSQL_PWD="$DB_PASSWORD" mysqldump \
  -h "$DB_HOST" -u "$DB_USER" \
  --single-transaction --routines --triggers \
  "$DB_NAME" | gzip > "$OUT"

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Keep the newest 14 backups
ls -1t "$BACKUP_DIR"/gms_db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
