#!/usr/bin/env bash
# Browser E2E (agent-browser) for the Bussa Goonofaa Donation Campaign module.
# Verifies the module in the real UI against the managed database: sidebar
# registration, Set Goal & Distribute form, Record Achievement page, and the
# Office-wise Goal Report. All E2E rows are deleted afterwards.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(git show HEAD:.env | grep '^DATABASE_URL=' | cut -d= -f2-)"
PORT=3314
BASE="http://localhost:$PORT"
JAR=/tmp/camp-ui-cookies.txt
SHOTS=/tmp/camp-ui-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/camp-ui-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done

# ---------- seed one E2E test campaign with entries (via API) ----------
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b "$JAR" -c "$JAR" -o /dev/null -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "username=admin" \
  --data-urlencode "password=admin123" --data-urlencode "json=true" \
  "$BASE/api/auth/callback/credentials"
curl -s -b "$JAR" "$BASE/api/departments" > /tmp/camp-ui-depts.json
python3 - <<'PY' > /tmp/camp-ui-office-ids.txt
import json
d = json.load(open('/tmp/camp-ui-depts.json'))
names = ['Office of the Sub-City Administrator', 'Health Office', 'Land Administration Office']
chosen = []
for n in names:
    hit = next((x for x in d if n.lower() in x['name'].lower()), None)
    if hit and hit['id'] not in [c['id'] for c in chosen]:
        chosen.append(hit)
for x in d:
    if len(chosen) >= 3: break
    if x['id'] not in [c['id'] for c in chosen]:
        chosen.append(x)
print('\n'.join(c['id'] for c in chosen))
PY
readarray -t OFFICE < /tmp/camp-ui-office-ids.txt
START=$(date -u -d '10 days ago' +%F)
DEADLINE=$(date -u -d '50 days' +%F)
TODAY=$(date -u +%F)
cat > /tmp/camp-ui-create.json <<EOF
{
  "name": "E2E-TEST Charity Donation Campaign",
  "description": "Verification campaign for the browser E2E run",
  "totalGoal": 300000,
  "kindNote": "food grains, blankets",
  "startDate": "$START",
  "deadline": "$DEADLINE",
  "assignments": [
    {"departmentId": "${OFFICE[0]}", "minimumAmount": 100000, "note": "focus on business donors"},
    {"departmentId": "${OFFICE[1]}", "minimumAmount": 100000},
    {"departmentId": "${OFFICE[2]}", "minimumAmount": 50000}
  ]
}
EOF
curl -s -b "$JAR" -o /tmp/camp-ui-created.json -X POST "$BASE/api/donation-campaigns" \
  -H "Content-Type: application/json" --data @/tmp/camp-ui-create.json
CID=$(python3 -c "import json;print(json.load(open('/tmp/camp-ui-created.json'))['id'])")
curl -s -b "$JAR" -o /dev/null -X POST "$BASE/api/donation-campaigns/$CID/donations" \
  -H "Content-Type: application/json" \
  -d "{\"departmentId\":\"${OFFICE[0]}\",\"reportDate\":\"$TODAY\",\"cashAmount\":60000,\"inKindValue\":15000,\"inKindDetails\":\"20 blankets\",\"donorsCount\":30}"
echo "seeded E2E campaign $CID (deleted at the end)"

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
# dismiss the PWA install banner if it pops up (it overlays the page)
agent-browser find role button click --name "Not now" 2>/dev/null || true
sleep 1

# expand Initiatives -> Bussa Goonofa / Charity module
sidebar_ok=0
for i in $(seq 1 10); do
  if agent-browser find text "Initiatives" click 2>/dev/null; then sidebar_ok=1; break; fi
  sleep 1
done
[ "$sidebar_ok" = "1" ] || { echo "FAIL: Initiatives section not clickable"; exit 1; }
sleep 1

module_ok=0
for i in $(seq 1 10); do
  if agent-browser find text "Bussa Goonofa / Charity" click 2>/dev/null; then
    sleep 1
    if agent-browser find text "Set Goal & Distribute" > /dev/null 2>&1; then module_ok=1; break; fi
  fi
  sleep 1
done
[ "$module_ok" = "1" ] || { echo "FAIL: Bussa Goonofa / Charity module did not expand"; exit 1; }
echo "module expanded"

# 1) Set Goal & Distribute form renders
for i in $(seq 1 5); do
  if agent-browser find text "Set Goal & Distribute" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/1-text.txt" 2>&1
if grep -q "Set donation goal & distribute to offices" "$SHOTS/1-text.txt"; then
  echo "PASS: Set Goal & Distribute form renders (header present)"
else
  echo "FAIL: Set Goal & Distribute form missing header"
fi
if grep -q "Split equally" "$SHOTS/1-text.txt" && grep -q "Add office" "$SHOTS/1-text.txt" && grep -q "Publish Goal" "$SHOTS/1-text.txt"; then
  echo "PASS: distribution builder controls present"
else
  echo "FAIL: distribution builder controls missing"
fi
if grep -q "E2E-TEST Charity Donation Campaign" "$SHOTS/1-text.txt"; then
  echo "PASS: campaign list shows the E2E campaign"
else
  echo "FAIL: campaign list missing the E2E campaign"
fi
agent-browser screenshot "$SHOTS/1-set-goal.png" > /dev/null 2>&1

# 2) Record Achievement page renders and lists the campaign
for i in $(seq 1 5); do
  if agent-browser find text "Record Achievement" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/2-text.txt" 2>&1
if grep -q "E2E-TEST Charity Donation Campaign" "$SHOTS/2-text.txt"; then
  echo "PASS: Record Achievement page lists the campaign"
else
  echo "FAIL: Record Achievement page does not list the campaign"
fi
agent-browser screenshot "$SHOTS/2-record-achievement.png" > /dev/null 2>&1

# 3) Office Goal Report renders with office-wise rows
for i in $(seq 1 5); do
  if agent-browser find text "Office Goal Report" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 4
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/3-text.txt" 2>&1
if grep -q "Office-wise Goal Report" "$SHOTS/3-text.txt"; then
  echo "PASS: Office-wise Goal Report renders"
else
  echo "FAIL: Office-wise Goal Report missing"
fi
if grep -q "Campaign Total" "$SHOTS/3-text.txt"; then
  echo "PASS: office table includes the campaign total row"
else
  echo "FAIL: office table missing total row"
fi
if grep -q "75,000 ETB" "$SHOTS/3-text.txt"; then
  echo "PASS: report shows collected total 75,000 ETB (60k cash + 15k in-kind)"
else
  echo "FAIL: collected total not shown"
fi
if grep -q "Achievement Records (1)" "$SHOTS/3-text.txt"; then
  echo "PASS: report shows the seeded achievement record"
else
  echo "FAIL: achievement record missing from report"
fi
ERRS=$(agent-browser errors 2>/dev/null | head -1)
if [ -z "$ERRS" ]; then
  echo "PASS: no client-side page errors on the report"
else
  echo "WARN: page errors detected: $ERRS"
fi
agent-browser screenshot "$SHOTS/3-office-report.png" > /dev/null 2>&1

# ---------- cleanup ----------
curl -s -b "$JAR" -o /dev/null -X DELETE "$BASE/api/donation-campaigns/$CID"
LEFT=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(sum(1 for x in d if 'E2E-TEST' in x['name']))")
if [ "$LEFT" = "0" ]; then
  echo "PASS: cleanup — no E2E-TEST campaigns left"
else
  echo "FAIL: E2E-TEST campaigns still present ($LEFT)"
fi

echo "UI E2E DONE"
