#!/usr/bin/env bash
# E2E API sweep for the Initiative Performance Monitoring module.
# Boots the production standalone server against the REAL managed database,
# exercises the full module flow, verifies the analysis math, then DELETES
# every test row so production data stays clean.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3312
BASE="http://localhost:$PORT"
JAR=/tmp/mon-e2e-cookies.txt

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/mon-e2e-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done

pass=0; fail=0
check() { # $1=desc $2=expected $3=actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  PASS: $1 ($3)";
  else fail=$((fail+1)); echo "  FAIL: $1 (expected $2, got $3)"; fi
}

echo "=== login (NextAuth credentials flow) ==="
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
CODE=$(curl -s -b "$JAR" -c "$JAR" -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "username=admin" \
  --data-urlencode "password=admin123" --data-urlencode "json=true" \
  "$BASE/api/auth/callback/credentials")
check "admin login" "200" "$CODE"

echo "=== departments ==="
curl -s -b "$JAR" "$BASE/api/departments" > /tmp/mon-depts.json
DEPTS=$(python3 -c "import json;print(len(json.load(open('/tmp/mon-depts.json'))))")
if [ "$DEPTS" -ge 13 ]; then pass=$((pass+1)); echo "  PASS: departments seeded ($DEPTS)"; else fail=$((fail+1)); echo "  FAIL: departments seeded ($DEPTS)"; fi
DEPT_ID=$(python3 -c "import json;d=json.load(open('/tmp/mon-depts.json'));print([x for x in d if 'Water' in x['name']][0]['id'])")

echo "=== auth enforcement ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/initiatives/stats")
check "stats without session -> 401" "401" "$CODE"
# admin session + empty payload -> 400 validation error (no side effect)
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/departments" -H "Content-Type: application/json" -d '{"name":""}')
check "departments POST validation (admin) -> 400" "400" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/departments" -H "Content-Type: application/json" -d '{"name":"anon dept"}')
check "departments POST without session -> 401" "401" "$CODE"

echo "=== create test initiative (E2E-TEST rows, deleted at the end) ==="
TODAY=$(date -u +%F)
YESTERDAY=$(date -u -d "yesterday" +%F 2>/dev/null || date -u -v-1d +%F)
NEXTYEAR=$(date -u -d "+365 days" +%F 2>/dev/null || date -u -v+365d +%F)
LASTYEAR=$(date -u -d "-365 days" +%F 2>/dev/null || date -u -v-365d +%F)
cat > /tmp/mon-create.json <<EOF
{
  "name": "E2E-TEST Water Extension Initiative",
  "description": "Temporary verification row for the performance monitoring module",
  "category": "Infrastructure",
  "departmentId": "$DEPT_ID",
  "subCity": "Dukam",
  "area": "Odaa Nabee",
  "establishmentDate": "$LASTYEAR",
  "expectedOperationalDate": "$LASTYEAR",
  "location": "E2E test site",
  "contactName": "E2E Bot",
  "contactPhone": "0911000000",
  "targets": [
    {"metric": "E2E km of water line", "unit": "km", "targetValue": 10, "periodType": "total", "dueDate": "$LASTYEAR"},
    {"metric": "E2E households connected", "unit": "households", "targetValue": 100, "periodType": "total"}
  ]
}
EOF
CODE=$(curl -s -b "$JAR" -o /tmp/mon-created.json -w "%{http_code}" -X POST "$BASE/api/initiatives" \
  -H "Content-Type: application/json" --data @/tmp/mon-create.json)
check "create initiative" "201" "$CODE"
INIT_ID=$(python3 -c "import json;print(json.load(open('/tmp/mon-created.json'))['id'])")
NT=$(python3 -c "import json;print(len(json.load(open('/tmp/mon-created.json'))['targets']))")
check "2 inline targets created" "2" "$NT"
T1=$(python3 -c "import json;print(json.load(open('/tmp/mon-created.json'))['targets'][0]['id'])")

echo "=== daily reports (yesterday + today) ==="
CODE=$(curl -s -b "$JAR" -o /tmp/mon-r1.json -w "%{http_code}" -X POST "$BASE/api/initiatives/$INIT_ID/reports" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"$YESTERDAY\",\"activities\":\"E2E: laid 3 km of pipe\",\"achievedValue\":3,\"targetId\":\"$T1\"}")
check "report yesterday" "201" "$CODE"
CODE=$(curl -s -b "$JAR" -o /tmp/mon-r2.json -w "%{http_code}" -X POST "$BASE/api/initiatives/$INIT_ID/reports" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"$TODAY\",\"activities\":\"E2E: laid 2.5 km more, connected 40 households\",\"achievedValue\":2.5,\"targetId\":\"$T1\"}")
check "report today" "201" "$CODE"
# upsert same day (update)
CODE=$(curl -s -b "$JAR" -o /tmp/mon-r3.json -w "%{http_code}" -X POST "$BASE/api/initiatives/$INIT_ID/reports" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"$TODAY\",\"activities\":\"E2E: corrected report — 2.5 km\",\"achievedValue\":2.5,\"targetId\":\"$T1\"}")
check "same-day resubmit updates (upsert)" "201" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/initiatives/$INIT_ID/reports" \
  -H "Content-Type: application/json" -d "{\"reportDate\":\"2099-01-01\",\"activities\":\"future\"}")
check "future report date rejected" "400" "$CODE"

echo "=== analysis math (detail endpoint) ==="
curl -s -b "$JAR" "$BASE/api/initiatives/$INIT_ID" > /tmp/mon-detail.json
python3 - <<'PY'
import json, sys
d = json.load(open('/tmp/mon-detail.json'))
a = d['analysis']
ok = True
def chk(desc, expected, actual):
    global ok
    good = abs((actual or 0) - expected) < 0.01 if isinstance(expected, (int, float)) else expected == actual
    print(("  PASS: " if good else "  FAIL: ") + f"{desc} (expected {expected}, got {actual})")
    ok = ok and good
chk("total target = 110", 110, a["totalTarget"])
chk("achieved = 5.5", 5.5, a["achievedTotal"])
chk("attainment = 5%", 5.0, a["attainmentPct"])
chk("delayed (expected date in the past)", True, a["delayed"])
chk("delayDays >= 365", a["delayDays"] >= 365, True)
chk("reportsLast7Days = 2", 2, a["reportsLast7Days"])
chk("reportDueToday = False (reported today)", False, a["reportDueToday"])
chk("metTargets = 0", 0, a["metTargets"])
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "=== stats endpoint (dashboard payload) ==="
curl -s -b "$JAR" "$BASE/api/initiatives/stats" > /tmp/mon-stats.json
python3 - <<'PY'
import json, sys
s = json.load(open('/tmp/mon-stats.json'))
ok = True
def chk(desc, expected, actual):
    global ok
    good = expected == actual
    print(("  PASS: " if good else "  FAIL: ") + f"{desc} (expected {expected}, got {actual})")
    ok = ok and good
chk("statusDistribution has PROPOSED (new initiative default)", True, "PROPOSED" in s["statusDistribution"])
chk("delayed list contains our initiative", True, any(x["id"] for x in s["delayed"]))
chk("targetVsActual includes Water dept", True, any("Water" in x["department"] for x in s["targetVsActual"]))
chk("trend covers 14 days", 14, len(s["trend"]))
chk("trend today reports >= 1", True, s["trend"][-1]["reports"] >= 1)
chk("recentReports includes E2E", True, any("E2E" in r["initiativeName"] for r in s["recentReports"]))
chk("departments accountability present", True, len(s["departments"]) >= 1)
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "=== status transition -> FULLY_OPERATIONAL stamps operationalDate ==="
CODE=$(curl -s -b "$JAR" -o /tmp/mon-patched.json -w "%{http_code}" -X PATCH "$BASE/api/initiatives/$INIT_ID" \
  -H "Content-Type: application/json" -d '{"status":"FULLY_OPERATIONAL"}')
check "PATCH status" "200" "$CODE"
OD=$(python3 -c "import json;d=json.load(open('/tmp/mon-patched.json'));print('operationalDate' in d and d['operationalDate'] is not None)")
check "operationalDate stamped" "True" "$OD"
OD2=$(python3 -c "import json;d=json.load(open('/tmp/mon-detail.json'));print(d['id'])")
curl -s -b "$JAR" "$BASE/api/initiatives/$INIT_ID" > /tmp/mon-detail2.json
ANALYSIS100=$(python3 -c "import json;d=json.load(open('/tmp/mon-detail2.json'));print(d['analysis']['progressPct']==100 and d['analysis']['delayed']==False)")
check "operational -> progress 100, not delayed" "True" "$ANALYSIS100"

echo "=== target management (admin) ==="
CODE=$(curl -s -b "$JAR" -o /tmp/mon-t3.json -w "%{http_code}" -X POST "$BASE/api/initiatives/$INIT_ID/targets" \
  -H "Content-Type: application/json" -d '{"metric":"E2E public taps","unit":"taps","targetValue":20,"periodType":"monthly"}')
check "add target" "201" "$CODE"
T3=$(python3 -c "import json;print(json.load(open('/tmp/mon-t3.json'))['id'])")
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/initiative-targets/$T3" \
  -H "Content-Type: application/json" -d '{"status":"ARCHIVED"}')
check "archive target" "200" "$CODE"

echo "=== export CSV ==="
CODE=$(curl -s -b "$JAR" -o /tmp/mon-export.csv -w "%{http_code}" "$BASE/api/initiatives/export")
check "export 200" "200" "$CODE"
ROWS=$(grep -c "E2E-TEST Water Extension" /tmp/mon-export.csv || true)
check "test initiative present in CSV" "1" "$ROWS"

echo "=== health endpoint reports the 4 new tables ==="
curl -s "$BASE/api/health" > /tmp/mon-health.json
python3 - <<'PY'
import json, sys
h = json.load(open('/tmp/mon-health.json'))
ok = True
for t in ("Department", "Initiative", "InitiativeTarget", "InitiativeDailyReport"):
    present = h["tables"].get(t) is True
    print(("  PASS: " if present else "  FAIL: ") + f"health tables[{t}] present")
    ok = ok and present
print(("  PASS: " if h["status"] == "ok" else "  FAIL: ") + f"health status ok")
ok = ok and h["status"] == "ok"
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] && pass=$((pass+1)) || fail=$((fail+1))

echo "=== cleanup: delete the E2E test initiative (cascade) ==="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/initiatives/$INIT_ID")
check "delete test initiative" "200" "$CODE"
LEFT=$(curl -s -b "$JAR" "$BASE/api/initiatives?search=E2E-TEST" | python3 -c "import json,sys;print(json.load(sys.stdin)['total'])")
check "no E2E rows left" "0" "$LEFT"

echo ""
echo "RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ] && echo "ALL API CHECKS PASSED" || exit 1
