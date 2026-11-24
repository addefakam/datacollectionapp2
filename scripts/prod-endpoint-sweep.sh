#!/bin/bash
# Production-mode endpoint sweep: run .next/standalone exactly like deployment
cd /home/z/my-project
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "standalone/server.js" 2>/dev/null || true
sleep 1

export NODE_ENV=production
export PORT=3111
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
node .next/standalone/server.js > /tmp/prod-server.log 2>&1 &
SRV=$!
code=000
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "root page: $code"

sweep() {
  local ep="$1"
  local out st
  out=$(curl -s -m 20 -w "\n%{http_code}" "http://localhost:3111$ep")
  st=$(echo "$out" | tail -1)
  local body=$(echo "$out" | head -c 120 | tr '\n' ' ')
  printf "%-42s %s  %s\n" "$ep" "$st" "$body"
}

echo "== GET endpoint sweep (authenticated) =="
# login first so admin-only endpoints are exercised like the real UI does
curl -s -m 20 -c /tmp/prod-cookies.txt "http://localhost:3111/api/auth/csrf" > /tmp/csrf.json
CSRF=$(python3 -c "import json;print(json.load(open('/tmp/csrf.json'))['csrfToken'])")
curl -s -m 20 -o /dev/null -b /tmp/prod-cookies.txt -c /tmp/prod-cookies.txt \
  -X POST "http://localhost:3111/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123&csrfToken=$CSRF&json=true"
AUTH='-b /tmp/prod-cookies.txt'

sweep() {
  local ep="$1"
  local out st
  out=$(curl -s -m 20 $AUTH -w "\n%{http_code}" "http://localhost:3111$ep")
  st=$(echo "$out" | tail -1)
  local body=$(echo "$out" | head -c 120 | tr '\n' ' ')
  printf "%-42s %s  %s\n" "$ep" "$st" "$body"
}

sweep "/api/smallenterprises"
sweep "/api/smallenterprises/stats"
sweep "/api/charities"
sweep "/api/goals?entityType=small-enterprise"
sweep "/api/goals?entityType=charity"
sweep "/api/guesthouses"
sweep "/api/industries"
sweep "/api/healthcenters"
sweep "/api/educationcenters"
sweep "/api/agriculturecenters"
sweep "/api/sub-cities"
sweep "/api/industry-categories"
sweep "/api/settings/stats-attribute"
sweep "/api/settings/stats-attribute-options"
sweep "/api/analytics/overview"
sweep "/api/meetings"
sweep "/api/assignments"
sweep "/api/industry-attendance"
sweep "/api/attendance"

echo "== server log errors =="
grep -iE "error|exception|P10|table" /tmp/prod-server.log | grep -v "0 errors" | head -15 || echo "(none)"
kill $SRV 2>/dev/null; pkill -9 -f "standalone/server.js" 2>/dev/null || true
echo "SWEEP DONE"
