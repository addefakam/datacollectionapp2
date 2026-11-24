#!/bin/bash
# Reproduce the DEPLOYED stale-runtime-DB scenario end to end:
#   deployed artifact layout:  <artifact>/next-service-dist/server.js
#                              <artifact>/db/{custom.db, schema-runtime.json, runtime-migrate.mjs}
#   start.sh: cd next-service-dist && bun ../db/runtime-migrate.mjs  (self-heal)
#             then boot server.js with the externally injected DATABASE_URL.
# Scenario: runtime DB predates recent modules (only User+GuestHouse, missing
# columns) → without self-heal every module API 500s ("Failed to load data",
# surveys stuck "waiting for sync") → with self-heal all endpoints return 200.
set -e
cd /home/z/my-project

ROOT=/tmp/stale-sim
rm -rf "$ROOT"
mkdir -p "$ROOT/db" "$ROOT/next-service-dist"

echo "=== 1. build stale runtime DB (only old User+GuestHouse, with data) ==="
python3 scripts/make-stale-db.py

echo "=== 2. assemble artifact layout (standalone + db/) ==="
cp -r .next/standalone/. "$ROOT/next-service-dist/"
cp db/schema-runtime.json db/runtime-migrate.mjs "$ROOT/db/"
cp db/custom.db "$ROOT/db/packaged.db"   # packaged copy (unused here)

DB_URL="file:$ROOT/db/custom.db"

echo "=== 3. run startup self-heal exactly like start.sh ==="
cd "$ROOT/next-service-dist"
DATABASE_URL="$DB_URL" bun ../db/runtime-migrate.mjs 2>&1 | tail -6

echo "=== 4. boot server (bun, like deployment) ==="
NODE_ENV=production PORT=3222 DATABASE_URL="$DB_URL" NEXTAUTH_URL=http://localhost:3222 NEXTAUTH_SECRET=sim-secret bun server.js > /tmp/stale-sim-server.log 2>&1 &
SRV=$!
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3222/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "root page: $code"

echo "=== 5. /api/health must report every module table present ==="
curl -s http://localhost:3222/api/health | python3 -m json.tool

echo "=== 6. authenticated module sweep (login like the UI) ==="
curl -s -c /tmp/stale-cookies.txt "http://localhost:3222/api/auth/csrf" > /tmp/stale-csrf.json
CSRF=$(python3 -c "import json;print(json.load(open('/tmp/stale-csrf.json'))['csrfToken'])")
curl -s -o /dev/null -b /tmp/stale-cookies.txt -c /tmp/stale-cookies.txt \
  -X POST "http://localhost:3222/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123&csrfToken=$CSRF&json=true"
AUTH='-b /tmp/stale-cookies.txt'
login_st=$(curl -s -o /dev/null -w "%{http_code}" $AUTH http://localhost:3222/api/auth/session)
echo "login session check: $login_st"

for ep in /api/smallenterprises /api/charities "/api/goals?entityType=small-enterprise" /api/guesthouses /api/industries /api/healthcenters /api/educationcenters /api/agriculturecenters /api/sub-cities /api/industry-categories; do
  st=$(curl -s -o /dev/null -w "%{http_code}" $AUTH "http://localhost:3222$ep")
  printf "%-46s %s\n" "$ep" "$st"
done

echo "=== 7. POST a survey (what 'waiting for sync' retries) ==="
st=$(curl -s -o /tmp/stale-post.json -w "%{http_code}" $AUTH \
  -X POST http://localhost:3222/api/smallenterprises -H "Content-Type: application/json" \
  -d '{"enterpriseName":"STALE SIM PROOF","enterpriseType":"Trade","ownershipType":"private","subCity":"Bishoftu","area":"01","specificAddress":"sim street","contactName":"Sim Manager","contactPhone":"0911000000","employeeCount":3,"maleEmployees":1,"femaleEmployees":2,"typeofLicense":"new","capital":"50000","yearsOfExperience":1}')
echo "POST /api/smallenterprises -> $st  body: $(head -c 90 /tmp/stale-post.json)"

echo "=== 8. self-heal idempotency (2nd run must be a no-op) ==="
cd "$ROOT/next-service-dist"
DATABASE_URL="$DB_URL" bun ../db/runtime-migrate.mjs 2>&1 | tail -4

echo "=== 9. data preserved? (pre-existing user + survey still there) ==="
python3 - "$ROOT/db/custom.db" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
users = con.execute("SELECT username FROM User").fetchall()
sme = con.execute("SELECT enterpriseName FROM SmallEnterprise").fetchall()
print("users:", [u[0] for u in users])
print("small enterprises:", [s[0] for s in sme])
EOF

kill $SRV 2>/dev/null; pkill -9 -f "stale-sim/next-service-dist" 2>/dev/null || true
echo "STALE-SIM DONE"
