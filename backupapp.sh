#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"
DATE="$(date +"%Y%m%d_%H%M%S")"
BACKUP_PATH="$BACKUP_DIR/$DATE"

FILES=(
    "index.html"
    "admin.html"
    "account.html"
    "register.html"
    "ranking.html"
    "recruit.html"
    "server.js"
    "package.json"
    "login.html"
    "territory_manager.html"
    "vercel.json"
    "db.js"
)

mkdir -p "$BACKUP_PATH"

echo "🔄 백업 시작: $DATE"
for file in "${FILES[@]}"; do
    if [ -f "$SCRIPT_DIR/$file" ]; then
        cp "$SCRIPT_DIR/$file" "$BACKUP_PATH/"
        echo "✅ $file 백업 완료"
    else
        echo "⚠️  $file 파일을 찾을 수 없습니다"
    fi
done

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} + 2>/dev/null || true

echo "✅ 백업 완료: $BACKUP_PATH"
echo "📁 백업 파일 수: $(find "$BACKUP_PATH" -maxdepth 1 -type f | wc -l | tr -d ' ')"
