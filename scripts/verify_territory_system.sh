#!/bin/bash

# 영토 관리 시스템 간단 검증 스크립트

echo "🔍 영토 관리 시스템 검증 시작"
echo ""

# 1. 필수 파일 존재 확인
echo "📁 파일 존재 확인:"
files=(
    "territory_manager.html"
    "TERRITORY_MANAGER_GUIDE.md"
    "scripts/test_territory_automation.js"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (missing)"
    fi
done

echo ""

# 2. server.js에 calculateBBoxFromGeometry 함수 존재 확인
echo "🔧 server.js 함수 확인:"
if grep -q "calculateBBoxFromGeometry" server.js; then
    echo "  ✅ calculateBBoxFromGeometry 함수 존재"
else
    echo "  ❌ calculateBBoxFromGeometry 함수 없음"
fi

if grep -q "자동 검증 및 필드 추가" server.js; then
    echo "  ✅ POST /api/territories 자동화 로직 추가됨"
else
    echo "  ❌ POST /api/territories 자동화 로직 없음"
fi

echo ""

# 3. index.html에 영토 관리 링크 확인
echo "🔗 index.html 네비게이션 확인:"
if grep -q "territoryManagerLink" index.html; then
    echo "  ✅ 영토 관리 링크 존재"
else
    echo "  ❌ 영토 관리 링크 없음"
fi

if grep -q "territory_manager.html" index.html; then
    echo "  ✅ territory_manager.html 링크 연결됨"
else
    echo "  ❌ territory_manager.html 링크 없음"
fi

echo ""

# 4. MongoDB 연결 테스트 (간단히)
echo "💾 MongoDB 설정 확인:"
if grep -q "MONGODB_URI" .env 2>/dev/null; then
    echo "  ✅ .env에 MONGODB_URI 설정됨"
else
    echo "  ⚠️  .env 파일 확인 필요"
fi

echo ""
echo "═══════════════════════════════════════"
echo "✅ 기본 검증 완료!"
echo "═══════════════════════════════════════"
echo ""
echo "📝 다음 단계:"
echo "  1. 로컬 서버 실행: npm start"
echo "  2. 브라우저에서 접속: http://localhost:3000"
echo "  3. 관리자 계정으로 로그인"
echo "  4. '영토 관리' 버튼 클릭"
echo "  5. 테스트 GeoJSON 입력 후 '처리 및 저장' 클릭"
echo ""
echo "📖 자세한 사용법: TERRITORY_MANAGER_GUIDE.md 참조"
