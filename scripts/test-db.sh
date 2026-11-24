#!/usr/bin/env bash
# Spins up a throwaway PostgreSQL 16 cluster, applies the Supabase shim and all
# migrations, then runs every supabase/tests/*.test.sql file.
# Usage: npm run test:db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="${TMPDIR:-/tmp}/meridian-db-test-$$"
PORT="${TEST_DB_PORT:-55432}"
mkdir -p "$WORK"
cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

RUNAS=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -r postgres
  chown -R postgres "$WORK"
  RUNAS="runuser -u postgres --"
fi

$RUNAS "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/tests/shim/supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migrate $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

fail=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  echo "→ test $(basename "$t")"
  if ! "${PSQL[@]}" -t -o /dev/null -f "$t" 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR): +/  \1: /' | tee "$WORK/out.txt" | grep -E 'ok -|ERROR|FAILED|✓'; then :; fi
  if grep -q "ERROR" "$WORK/out.txt"; then fail=1; echo "✗ FAILED: $(basename "$t")"; fi
done
[ $fail -eq 0 ] && echo "✓ All database tests passed" || { echo "✗ Database tests failed"; exit 1; }
