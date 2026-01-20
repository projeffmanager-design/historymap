#!/bin/bash
# filepath: backup.sh

# 백업 디렉토리 설정
BACKUP_DIR="./backups"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="$BACKUP_DIR/$DATE"

# 백업 디렉토리 생성
mkdir -p "$BACKUP_PATH"

# 백업할 파일 목록
FILES=(
    "index.html"
    "admin.html"
    "account.html"
    "server.js"
    "package.json"
    "login.html"
    "territory_manager.html"
)

# 파일 백업 실행
echo "🔄 백업 시작: $DATE"
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_PATH/"
        echo "✅ $file 백업 완료"
    else
        echo "⚠️  $file 파일을 찾을 수 없습니다"
    fi
done

# 7일 이상 된 백업 자동 삭제
find "$BACKUP_DIR" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null

echo "✅ 백업 완료: $BACKUP_PATH"
echo "📁 백업 파일 수: $(ls -1 $BACKUP_PATH 2>/dev/null | wc -l)"
