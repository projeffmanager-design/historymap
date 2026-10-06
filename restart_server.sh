#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/server.log"
LEGACY_APP_DIR="/Users/jeffhwang/Documents/KoreaHistory"

if [ -d "$SCRIPT_DIR/node_modules" ]; then
    NODE_MODULES_DIR="$SCRIPT_DIR/node_modules"
elif [ -d "$LEGACY_APP_DIR/node_modules" ]; then
    NODE_MODULES_DIR="$LEGACY_APP_DIR/node_modules"
else
    echo "❌ node_modules가 없습니다. 이 작업 트리에서 npm ci를 먼저 실행하세요." >&2
    exit 1
fi

if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_FILE="$SCRIPT_DIR/.env"
elif [ -f "$LEGACY_APP_DIR/.env" ]; then
    ENV_FILE="$LEGACY_APP_DIR/.env"
else
    echo "❌ .env 파일을 찾을 수 없습니다." >&2
    exit 1
fi

echo "🔄 KoreaHistory 서버 재시작 중..."

if [ -f "$PID_FILE" ]; then
    SERVER_PID="$(tr -dc '0-9' < "$PID_FILE")"
else
    SERVER_PID=""
fi

# PID 파일이 없거나 오래됐으면 3000번 포트를 점유한 이 작업 트리의 서버를 찾는다.
if [ -z "$SERVER_PID" ] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
    PORT_PID="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    if [ -n "$PORT_PID" ]; then
        PORT_CWD="$(lsof -a -p "$PORT_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
        if [ "$PORT_CWD" = "$SCRIPT_DIR" ]; then
            SERVER_PID="$PORT_PID"
            echo "$SERVER_PID" > "$PID_FILE"
        else
            echo "❌ 3000번 포트를 다른 프로세스가 사용 중입니다 (PID: $PORT_PID, 경로: ${PORT_CWD:-알 수 없음})." >&2
            echo "   다른 프로세스는 자동으로 종료하지 않았습니다." >&2
            exit 1
        fi
    fi
fi

if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "📍 기존 서버 프로세스 발견 (PID: $SERVER_PID)"
    kill "$SERVER_PID"

    for i in {1..10}; do
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            echo "✅ 서버 중지 완료"
            break
        fi
        echo "⏳ 서버 종료 대기 중... ($i/10)"
        sleep 1
    done

    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "⚠️  정상 종료 실패, 강제 종료 시도..."
        kill -9 "$SERVER_PID"
        sleep 1
    fi
else
    echo "ℹ️  이 작업 트리에서 실행 중인 서버 프로세스가 없습니다"
fi

echo "🚀 새 서버 시작 중..."
cd "$SCRIPT_DIR"
NODE_PATH="$NODE_MODULES_DIR" DOTENV_CONFIG_PATH="$ENV_FILE" \
    nohup node -r dotenv/config "$SCRIPT_DIR/server.js" > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 3

if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "✅ 서버 재시작 완료 (새 PID: $NEW_PID)"
    echo "📝 로그 파일: $LOG_FILE"
else
    echo "❌ 서버 시작 실패" >&2
    echo "📝 로그 확인: tail -20 '$LOG_FILE'" >&2
    tail -20 "$LOG_FILE" >&2 || true
    rm -f "$PID_FILE"
    exit 1
fi
