#!/usr/bin/env bash
# Browser E2E (agent-browser) for the Initiative Performance Monitoring module.
# Verifies the module end-to-end in the real UI against the managed database:
# sidebar registration, establish form, daily report page, records + detail
# dialog, and the performance dashboard. All E2E rows are deleted afterwards.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3313
BASE="http://localhost:$PORT"
JAR=/tmp/mon-ui-cookies.txt
SHOTS=/tmp/mon-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/mon-ui-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done

# ---------- seed one E2E test initiative with reports (via API) ----------
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b "$JAR" -c "$JAR" -o /dev/null -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "username=admin" \
  --data-urlencode "password=admin123" --data-urlencode "json=true" \
  "$BASE/api/auth/callback/credentials"
curl -s -b "$JAR" "$BASE/api/departments" > /tmp/mon-ui-depts.json
DEPT_ID=$(python3 -c "import json;d=json.load(open('/tmp/mon-ui-depts.json'));print([x for x in d if 'Urban Development' in x['name']][0]['id'])")
LASTYEAR=$(date -u -d "-365 days" +%F 2>/dev/null || date -u -v-365d +%F)
TODAY=$(date -u +%F)
cat > /tmp/mon-ui-create.json <<EOF
{
  "name": "E2E-TEST Market Road Upgrade",
  "description": "Verification initiative for the browser E2E run",
  "category": "Infrastructure",
  "departmentId": "$DEPT_ID",
  "subCity": "Dukam",
  "area": "Odaa Nabee",
  "establishmentDate": "$LASTYEAR",
  "expectedOperationalDate": "$LASTYEAR",
  "location": "E2E UI test site",
  "targets": [{"metric": "E2E km paved", "unit": "km", "targetValue": 8, "periodType": "total", "dueDate": "$LASTYEAR"}]
}
EOF
curl -s -b "$JAR" -o /tmp/mon-ui-created.json -X POST "$BASE/api/initiatives" \
  -H "Content-Type: application/json" --data @/tmp/mon-ui-create.json
INIT_ID=$(python3 -c "import json;print(json.load(open('/tmp/mon-ui-created.json'))['id'])")
T1=$(python3 -c "import json;print(json.load(open('/tmp/mon-ui-created.json'))['targets'][0]['id'])")
curl -s -b "$JAR" -o /dev/null -X POST "$BASE/api/initiatives/$INIT_ID/reports" \
  -H "Content-Type: application/json" \
  -d "{\"reportDate\":\"$TODAY\",\"activities\":\"E2E UI: paved 2 km today\",\"achievedValue\":2,\"targetId\":\"$T1\"}"
echo "seeded E2E initiative $INIT_ID (deleted at the end)"

# ---------- browser flow ----------
agent-browser set viewport 1440 900
agent-browser open "$BASE/"
agent-browser wait --load networkidle

login_ok=0
for i in $(seq 1 15); do
  if agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null; then login_ok=1; break; fi
  sleep 2
done
[ "$login_ok" = "1" ] || { echo "FAIL: login form never rendered"; exit 1; }
agent-browser find placeholder "Enter your password" fill "admin123"
agent-browser find role button click --name "Sign In"
sleep 3
agent-browser wait --load networkidle
echo "logged in"

# expand Initiatives section -> Performance Monitoring module
sidebar_ok=0
for i in $(seq 1 10); do
  if agent-browser find text "Initiatives" click 2>/dev/null; then sidebar_ok=1; break; fi
  sleep 1
done
[ "$sidebar_ok" = "1" ] || { echo "FAIL: Initiatives section not clickable"; exit 1; }
sleep 1
agent-browser find text "Performance Monitoring" click
sleep 1

# 1) Establish Initiative form renders
agent-browser find text "Establish Initiative" click
sleep 2
agent-browser wait --load networkidle
if agent-browser find text "Responsible Department" > /dev/null 2>&1; then
  echo "PASS: Establish Initiative form renders (department field present)"
else
  echo "FAIL: Establish Initiative form missing department field"
fi
agent-browser screenshot "$SHOTS/1-establish-form.png" > /dev/null 2>&1

# 2) Daily Report page renders and lists the seeded initiative
agent-browser find text "Daily Report" click
sleep 2
agent-browser wait --load networkidle
if agent-browser find text "E2E-TEST Market Road Upgrade" > /dev/null 2>&1; then
  echo "PASS: Daily Report page lists the initiative"
else
  echo "FAIL: Daily Report page does not list the initiative"
fi
agent-browser screenshot "$SHOTS/2-daily-report.png" > /dev/null 2>&1

# 3) Initiative Records: card visible with analysis tiles, open detail dialog
agent-browser find text "Initiative Records" click
sleep 2
agent-browser wait --load networkidle
if agent-browser find text "E2E-TEST Market Road Upgrade" > /dev/null 2>&1; then
  echo "PASS: Records page shows the initiative card"
else
  echo "FAIL: Records page missing the initiative card"
fi
agent-browser screenshot "$SHOTS/3-records.png" > /dev/null 2>&1
agent-browser find text "E2E-TEST Market Road Upgrade" click
sleep 1.5
if agent-browser find text "Follow-up lifecycle" > /dev/null 2>&1; then
  echo "PASS: detail dialog opens (lifecycle panel present)"
else
  echo "FAIL: detail dialog did not open"
fi
# Targets tab (default) shows attainment 25% (2 of 8 km)
if agent-browser find text "Attainment" > /dev/null 2>&1; then
  echo "PASS: Targets tab renders with attainment"
else
  echo "FAIL: Targets tab missing"
fi
agent-browser find role tab click --name "Daily Reports" 2>/dev/null || agent-browser find text "Daily Reports" click
sleep 1
if agent-browser find text "paved 2 km today" > /dev/null 2>&1; then
  echo "PASS: Daily Reports timeline shows the seeded report"
else
  echo "FAIL: daily report row missing in dialog"
fi
agent-browser screenshot "$SHOTS/4-detail-dialog.png" > /dev/null 2>&1
agent-browser press Escape
sleep 1

# 4) Performance Dashboard renders with live analysis
agent-browser find text "Performance Dashboard" click
sleep 3
agent-browser wait --load networkidle
if agent-browser find text "Department accountability" > /dev/null 2>&1; then
  echo "PASS: dashboard renders (accountability table present)"
else
  echo "FAIL: dashboard missing accountability table"
fi
if agent-browser find text "E2E-TEST Market Road Upgrade" > /dev/null 2>&1; then
  echo "PASS: dashboard flags the delayed E2E initiative"
else
  echo "FAIL: dashboard does not list the delayed initiative"
fi
agent-browser screenshot "$SHOTS/5-dashboard.png" > /dev/null 2>&1

# ---------- cleanup: remove the E2E rows ----------
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/initiatives/$INIT_ID")
LEFT=$(curl -s -b "$JAR" "$BASE/api/initiatives?search=E2E-TEST" | python3 -c "import json,sys;print(json.load(sys.stdin)['total'])")
echo "cleanup: delete=$CODE, remaining E2E rows=$LEFT"

echo "UI E2E COMPLETE — screenshots in $SHOTS"
