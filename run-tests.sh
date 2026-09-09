#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
FAIL=0

if [ "${1:-}" != "--no-up" ]; then
  SITE_PORT="${PORT:-3021}"
  if ! lsof -nP -iTCP:"$SITE_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "> site not running, starting it first"
    ./start.sh >/dev/null 2>&1 || true
    sleep 0.5
  fi
fi

echo "> i18n check (tokens and translation completeness)"
python3 code/shared/i18n/gen-i18n.py --check || FAIL=1


for d in code/tests/unit code/tests/integration; do
  if [ -n "$(find "$d" -name 'test_*.py' -o -name '*_test.py' 2>/dev/null | head -1)" ]; then
    echo
    echo "> tests $d"
    python3 -m unittest discover -s "$d" 2>&1 | tail -20
    [ "${PIPESTATUS[0]}" -eq 0 ] || FAIL=1
  fi
done

echo
if [ "$FAIL" -eq 0 ]; then
  echo "OK  all tests passed"
else
  echo "FAIL  some tests failed"
fi
exit $FAIL
