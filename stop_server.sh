#!/bin/bash

# KoreaHistory 테스트 서버 종료 스크립트
echo "🛑 KoreaHistory 서버 종료 중..."

STOPPED=0

# 1) node server.js 프로세스 찾기
PIDS=$(ps aux | grep "node server.js" | grep -v grep | awk '{print $2}')

if [ ! -z "$PIDS" ]; then
    for PID in $PIDS; do
        echo "📍 서버 프로세스 발견 (PID: $PID) — 종료 요청..."
        kill $PID 2>/dev/null

        # 최대 5초 대기
        for i in {1..5}; do
            if ! ps -p $PID > /dev/null 2>&1; then
                echo "✅ PID $PID 정상 종료"
                STOPPED=1
                break
            fi
            sleep 1
        done

        # 그래도 살아있으면 강제 종료
        if ps -p $PID > /dev/null 2>&1; then
            echo "⚠️  정상 종료 실패 — 강제 종료 (PID: $PID)"
            kill -9 $PID 2>/dev/null
            sleep 1
            if ! ps -p $PID > /dev/null 2>&1; then
                echo "✅ PID $PID 강제 종료 완료"
                STOPPED=1
            else
                echo "❌ PID $PID 종료 실패"
            fi
        fi
    done
fi

# 2) 포트 3000을 사용 중인 프로세스도 추가 확인
PORT_PID=$(lsof -ti tcp:3000 2>/dev/null)
if [ ! -z "$PORT_PID" ]; then
    echo "📍 포트 3000 점유 프로세스 발견 (PID: $PORT_PID) — 종료 요청..."
    kill $PORT_PID 2>/dev/null
    sleep 1
    if ! ps -p $PORT_PID > /dev/null 2>&1; then
        echo "✅ 포트 3000 프로세스 종료 완료"
        STOPPED=1
    else
        kill -9 $PORT_PID 2>/dev/null
        sleep 1
        echo "✅ 포트 3000 프로세스 강제 종료 완료"
        STOPPED=1
    fi
fi

if [ $STOPPED -eq 0 ]; then
    echo "ℹ️  실행 중인 서버가 없습니다"
else
    echo ""
    echo "🏁 서버 종료 완료"
fi
