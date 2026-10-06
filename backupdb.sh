#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${DB_BACKUP_SCRIPT:-}" ]; then
    BACKUP_SCRIPT="$DB_BACKUP_SCRIPT"
elif [ -x "$SCRIPT_DIR/../koreahistorydb/backup_mongo.sh" ]; then
    BACKUP_SCRIPT="$SCRIPT_DIR/../koreahistorydb/backup_mongo.sh"
else
    BACKUP_SCRIPT="/Users/jeffhwang/Documents/koreahistorydb/backup_mongo.sh"
fi

if [ ! -x "$BACKUP_SCRIPT" ]; then
    echo "❌ MongoDB 백업 스크립트를 실행할 수 없습니다: $BACKUP_SCRIPT" >&2
    echo "   DB_BACKUP_SCRIPT 환경 변수로 경로를 지정할 수 있습니다." >&2
    exit 1
fi

exec "$BACKUP_SCRIPT"
