#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$ROOT/.runtime/logs/product-web.log"
PORT="${PORT:-3021}"
mkdir -p "$(dirname "$LOG")"

kill_port() { # a fixed port is only fixed if we can take it back
  local pids
  pids=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  port $PORT is held (PID: $(echo "$pids" | tr '\n' ' ')), killing it and restarting"
    kill -9 $pids 2>/dev/null || true
    sleep 0.3
  fi
}

start_all() {
  kill_port
  ( cd "$ROOT" && nohup node code/web/dev-server.js "$PORT" >"$LOG" 2>&1 </dev/null & ) >/dev/null 2>&1
  for _ in $(seq 1 50); do
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "  http://localhost:$PORT/"
      echo "  http://localhost:$PORT/about"
      return 0
    fi
    sleep 0.1
  done
  echo "  x failed to start, see $LOG"
  return 1
}

status_all() {
  local pids
  pids=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "running on $PORT, PID $(echo "$pids" | tr '\n' ' ')"
  else
    echo "stopped"
  fi
}

case "${1:-start}" in
  start)   start_all ;;
  stop)    kill_port; echo "stopped" ;;
  status)  status_all ;;
  restart) kill_port; start_all ;;
  *) echo "usage: ./start.sh [start|stop|status|restart]"; exit 1 ;;
esac
