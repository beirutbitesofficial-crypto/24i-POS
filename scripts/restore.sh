#!/usr/bin/env bash
# Restore a backup into an EMPTY database (create it first). Never restore over a live database.
# Usage: DATABASE_URL=postgresql://.../pos24i_restore ./scripts/restore.sh backups/pos24i-YYYYMMDD-HHMMSS.dump
set -euo pipefail
FILE="${1:?backup file required}"
URL="${DATABASE_URL%%\?*}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$URL" "$FILE"
echo "Restored $FILE"
