
#!/bin/bash

# 인자(patch, minor, major)가 입력되었는지 확인
if [ -z "$1" ]; then
    echo "오류: 버전 유형을 입력해주세요. (예: ./bump.sh patch)"
    echo "사용 가능한 옵션: patch, minor, major"
    exit 1
fi

echo "🚀 버전을 업데이트합니다: [$1]..."

# Node.js 스크립트 실행 및 인자 전달
node scripts/bump-version.js "$1"

echo "✅ 버전 업데이트가 완료되었습니다!"
