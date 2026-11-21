#!/usr/bin/env bash
# Nightly backup: compressed custom-format dump, keeps the last 30.
# Usage: DATABASE_URL=postgresql://... ./scripts/backup.sh [backup-dir]
set -euo pipefail
DIR="${1:-./backups}"
mkdir -p "$DIR"
URL="${DATABASE_URL%%\?*}"   # pg_dump does not understand Prisma's ?schema= param
FILE="$DIR/pos24i-$(date +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges "$URL" > "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t "$DIR"/pos24i-*.dump | tail -n +31 | xargs -r rm --
