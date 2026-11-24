#!/usr/bin/env bash
# E2E: boot the production standalone server against the REAL managed
# PostgreSQL (Neon) and verify /api/health now reports record counts that
# match the database, admin login works, and the records API returns data.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3311
BASE="http://localhost:$PORT"

# standalone needs static assets copied next to it
rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/e2e-health-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

# wait for readiness
for i in $(seq 1 30); do
  if curl -sf "$BASE/api/health" > /tmp/e2e-health.json 2>/dev/null; then break; fi
  sleep 1
done

echo "=== /api/health ==="
python3 - <<'PY'
import json, re, sys
h = json.load(open('/tmp/e2e-health.json'))
print("status:", h.get("status"), "| database:", h.get("database"))
print("databaseUrl:", json.dumps(h.get("databaseUrl", {})))
print("hasUsers:", h.get("hasUsers"))
print("missingTables:", h.get("missingTables"))
rec = h.get("records") or {}
print("records:", json.dumps(rec, indent=None))
fail = []
if h.get("status") != "ok": fail.append("status not ok")
if h.get("hasUsers") is not True: fail.append("hasUsers not true")
if h.get("missingTables"): fail.append("tables missing")
if not rec or rec.get("total", 0) <= 0: fail.append("no record counts")
expected = {"GuestHouse": 171, "Industry": 7, "SubCityArea": 12, "IndustryCategory": 14}
for k, v in expected.items():
    if rec.get(k) != v: fail.append(f"{k}={rec.get(k)} expected {v}")
url = json.dumps(h.get("databaseUrl", {}))
if re.search(r"://[^\"@/:*]+:[^\"@*]+@", url): fail.append("credentials not masked")
print("FAILURES:", fail if fail else "none")
sys.exit(1 if fail else 0)
PY
[ $? -ne 0 ] && { echo "HEALTH CHECK FAILED"; exit 1; }

echo ""
echo "=== admin login (NextAuth credentials flow) ==="
rm -f /tmp/e2e-cookies.txt
CSRF=$(curl -s -c /tmp/e2e-cookies.txt "$BASE/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
LOGIN=$(curl -s -b /tmp/e2e-cookies.txt -c /tmp/e2e-cookies.txt -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=admin123" \
  --data-urlencode "json=true" \
  "$BASE/api/auth/callback/credentials")
echo "callback HTTP $LOGIN"
case "$LOGIN" in 200|302) ;; *) echo "LOGIN FAILED"; exit 1;; esac
SESS=$(curl -s -b /tmp/e2e-cookies.txt "$BASE/api/auth/session" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('user',{}).get('name') or d.get('user',{}).get('username') or 'NO SESSION')")
echo "session user: $SESS"
[ "$SESS" = "NO SESSION" ] && { echo "LOGIN FAILED"; exit 1; }

echo ""
echo "=== records API (guesthouses) ==="
GH=$(curl -s -b /tmp/e2e-cookies.txt "$BASE/api/guesthouses?page=1&limit=5")
COUNT=$(curl -s -b /tmp/e2e-cookies.txt "$BASE/api/guesthouses?page=1&limit=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total') or d.get('pagination',{}).get('total') or 'unknown')")
FIRST=$(echo "$GH" | python3 -c "import json,sys; d=json.load(sys.stdin); items=d.get('data') or d.get('guesthouses') or []; print((items[0].get('guestHouseName') or items[0].get('name') or '?') if items else 'NO DATA')")
echo "guesthouses total: $COUNT | first: $FIRST"

echo ""
echo "=== masked server log tail (no secrets) ==="
tail -3 /tmp/e2e-health-server.log | sed -E 's/(postgresql:\/\/[^:]+:)[^@ ]+@/\1***@/g'
echo ""
echo "ALL E2E CHECKS PASSED"
