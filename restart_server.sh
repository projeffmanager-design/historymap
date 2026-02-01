#!/bin/bash

# KoreaHistory 서버 재시작 스크립트
echo "🔄 KoreaHistory 서버 재시작 중..."

# 현재 실행 중인 node server.js 프로세스 찾기
SERVER_PID=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')

if [ ! -z "$SERVER_PID" ]; then
    echo "📍 기존 서버 프로세스 발견 (PID: $SERVER_PID)"
    echo "🛑 서버 중지 중..."
    kill $SERVER_PID

    # 프로세스가 완전히 종료될 때까지 대기
    for i in {1..10}; do
        if ! ps -p $SERVER_PID > /dev/null 2>&1; then
            echo "✅ 서버 중지 완료"
            break
        fi
        echo "⏳ 서버 종료 대기 중... ($i/10)"
        sleep 1
    done

    # 강제 종료 시도
    if ps -p $SERVER_PID > /dev/null 2>&1; then
        echo "⚠️  정상 종료 실패, 강제 종료 시도..."
        kill -9 $SERVER_PID
        sleep 2
    fi
else
    echo "ℹ️  실행 중인 서버 프로세스가 없습니다"
fi

echo "🚀 새 서버 시작 중..."
cd /Users/jeffhwang/Documents/KoreaHistory

# 서버 시작 (백그라운드에서 실행)
nohup node server.js > server.log 2>&1 &

# 서버가 시작될 때까지 잠시 대기
sleep 3

# 서버가 정상적으로 시작되었는지 확인
if ps aux | grep "node server.js" | grep -v grep > /dev/null; then
    NEW_PID=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')
    echo "✅ 서버 재시작 완료 (새 PID: $NEW_PID)"
    echo "📝 로그 파일: /Users/jeffhwang/Documents/KoreaHistory/server.log"
else
    echo "❌ 서버 시작 실패"
    echo "📝 로그 확인: tail -20 /Users/jeffhwang/Documents/KoreaHistory/server.log"
fi