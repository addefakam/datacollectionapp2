#!/usr/bin/env bash
# E2E API sweep for the Bussa Goonofaa Donation Campaign module
# (set goal -> distribute to offices -> record achievements -> office-wise report).
# Boots the production standalone server against the REAL managed database,
# exercises the full flow, verifies the analysis math, then DELETES every
# test row so production data stays clean.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(git show HEAD:.env | grep '^DATABASE_URL=' | cut -d= -f2-)"
PORT=3313
BASE="http://localhost:$PORT"
JAR=/tmp/camp-e2e-cookies.txt

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/camp-e2e-server.log 2>&1 &
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

echo "=== health: campaign tables ==="
HEALTH=$(curl -s "$BASE/api/health")
for T in DonationCampaign DonationCampaignAssignment DonationEntry; do
  check "health tables.$T" "True" "$(echo "$HEALTH" | python3 -c "import json,sys;print(json.load(sys.stdin)['tables']['$T'])")"
done

echo "=== auth enforcement ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/donation-campaigns")
check "campaigns without session -> 401" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d '{"name":"anon"}')
check "campaign create without session -> 401" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/donation-campaigns/export?campaignId=x")
check "export without session -> 401" "401" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d '{"name":""}')
check "campaign create empty payload -> 400" "400" "$CODE"

echo "=== departments ==="
curl -s -b "$JAR" "$BASE/api/departments" > /tmp/camp-depts.json
DEPTS=$(python3 -c "import json;print(len(json.load(open('/tmp/camp-depts.json'))))")
if [ "$DEPTS" -ge 13 ]; then pass=$((pass+1)); echo "  PASS: departments available ($DEPTS)"; else fail=$((fail+1)); echo "  FAIL: departments available ($DEPTS)"; fi

# pick offices: prefer the standard names, fall back to the first four listed
python3 - <<'PY' > /tmp/camp-office-ids.txt
import json
d = json.load(open('/tmp/camp-depts.json'))
names = ['Office of the Sub-City Administrator', 'Health Office', 'Land Administration Office', 'Environment Protection Office']
chosen = []
for n in names:
    hit = next((x for x in d if n.lower() in x['name'].lower()), None)
    if hit and hit['id'] not in [c['id'] for c in chosen]:
        chosen.append(hit)
for x in d:
    if len(chosen) >= 4: break
    if x['id'] not in [c['id'] for c in chosen]:
        chosen.append(x)
print('\n'.join(c['id'] for c in chosen))
PY
readarray -t OFFICE < /tmp/camp-office-ids.txt

START=$(date -u -d '30 days ago' +%F)
DEADLINE=$(date -u -d '60 days' +%F)
TODAY=$(date -u +%F)

echo "=== create campaign (E2E-TEST, deleted at the end) ==="
CREATE=$(curl -s -b "$JAR" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST Bussa Goonofaa Donation Campaign\",
  \"description\": \"temporary campaign for API verification\",
  \"totalGoal\": 600000,
  \"kindNote\": \"food grains, blankets\",
  \"startDate\": \"$START\",
  \"deadline\": \"$DEADLINE\",
  \"assignments\": [
    {\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 200000, \"note\": \"focus on business donors\"},
    {\"departmentId\": \"${OFFICE[1]}\", \"minimumAmount\": 150000},
    {\"departmentId\": \"${OFFICE[2]}\", \"minimumAmount\": 100000}
  ]
}")
CID=$(echo "$CREATE" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))")
if [ -n "$CID" ]; then pass=$((pass+1)); echo "  PASS: campaign created ($CID)"; else fail=$((fail+1)); echo "  FAIL: campaign created: $CREATE"; fi
check "assignments created" "3" "$(echo "$CREATE" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('assignments',[])))")"

echo "=== create validations ==="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST over\", \"totalGoal\": 100, \"startDate\": \"$START\", \"deadline\": \"$DEADLINE\",
  \"assignments\": [{\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 200}]
}")
check "distribution exceeding goal -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST zero\", \"totalGoal\": 100, \"startDate\": \"$START\", \"deadline\": \"$DEADLINE\",
  \"assignments\": [{\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 0}]
}")
check "office minimum of 0 -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST dup\", \"totalGoal\": 600, \"startDate\": \"$START\", \"deadline\": \"$DEADLINE\",
  \"assignments\": [{\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 300}, {\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 200}]
}")
check "duplicate office -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST dates\", \"totalGoal\": 600, \"startDate\": \"$DEADLINE\", \"deadline\": \"$START\",
  \"assignments\": [{\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 300}]
}")
check "deadline before start -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns" -H "Content-Type: application/json" -d "{
  \"name\": \"E2E-TEST empty\", \"totalGoal\": 600, \"startDate\": \"$START\", \"deadline\": \"$DEADLINE\", \"assignments\": []
}")
check "no distribution -> 400" "400" "$CODE"

echo "=== achievement recording validations ==="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"2099-01-01\", \"cashAmount\": 100
}")
check "future report date -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": -5
}")
check "negative cash -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 0, \"inKindValue\": 0
}")
check "all-zero amounts -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"nope\", \"reportDate\": \"$TODAY\", \"cashAmount\": 100
}")
check "unknown office -> 400" "400" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 100, \"donorsCount\": -3
}")
check "negative donors -> 400" "400" "$CODE"

echo "=== record achievements (3 offices, cash + in-kind) ==="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 50000, \"inKindValue\": 20000, \"inKindDetails\": \"15 quintals teff\", \"donorsCount\": 25
}")
check "office 1 record" "201" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[1]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 40000, \"donorsCount\": 12
}")
check "office 2 record" "201" "$CODE"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[2]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 10000, \"inKindValue\": 5000, \"donorsCount\": 8
}")
check "office 3 record" "201" "$CODE"

echo "=== analysis math (goal 600000; collected 125000) ==="
DETAIL=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns/$CID")
check "collected total" "125000" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['collected'])")"
check "cash total" "100000" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['cash'])")"
check "in-kind total" "25000" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['inKind'])")"
check "attainment %" "20.8" "$(echo "$DETAIL" | python3 -c "import json,sys;print(round(json.load(sys.stdin)['analysis']['attainmentPct'],1))")"
check "gap to goal" "475000" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['gap'])")"
check "donors total" "45" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['donors'])")"
check "entries total" "3" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['entries'])")"
check "office1 attainment 35%" "35" "$(echo "$DETAIL" | python3 -c "import json,sys;print(round([o['attainmentPct'] for o in json.load(sys.stdin)['analysis']['offices'] if o['departmentId']=='${OFFICE[0]}'][0],1))")"
check "office1 gap" "130000" "$(echo "$DETAIL" | python3 -c "import json,sys;print([o['gap'] for o in json.load(sys.stdin)['analysis']['offices'] if o['departmentId']=='${OFFICE[0]}'][0])")"
check "office3 state behind" "behind" "$(echo "$DETAIL" | python3 -c "import json,sys;print([o['state'] for o in json.load(sys.stdin)['analysis']['offices'] if o['departmentId']=='${OFFICE[2]}'][0])")"
check "campaign state" "behind" "$(echo "$DETAIL" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['state'])")"

echo "=== office-wise CSV export ==="
CSV=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns/export?campaignId=$CID")
echo "$CSV" | grep -q "E2E-TEST Bussa Goonofaa Donation Campaign" && P=1 || P=0
check "CSV contains campaign name" "1" "$P"
echo "$CSV" | grep -q "CAMPAIGN TOTAL" && P=1 || P=0
check "CSV contains total row" "1" "$P"
echo "$CSV" | grep -q "125000" && P=1 || P=0
check "CSV contains collected total" "1" "$P"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" "$BASE/api/donation-campaigns/export")
check "export without campaignId -> 400" "400" "$CODE"

echo "=== admin re-distribution (PATCH) ==="
PATCHED=$(curl -s -b "$JAR" -X PATCH "$BASE/api/donation-campaigns/$CID" -H "Content-Type: application/json" -d "{
  \"totalGoal\": 600000,
  \"assignments\": [
    {\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 250000, \"note\": \"raised after review\"},
    {\"departmentId\": \"${OFFICE[1]}\", \"minimumAmount\": 150000},
    {\"departmentId\": \"${OFFICE[3]}\", \"minimumAmount\": 50000}
  ]
}")
check "assignments after sync" "3" "$(echo "$PATCHED" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('assignments',[])))")"
check "removed office's entries counted unassigned" "15000" "$(curl -s -b "$JAR" "$BASE/api/donation-campaigns/$CID" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['unassignedCollected'])")"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/donation-campaigns/$CID" -H "Content-Type: application/json" -d "{
  \"assignments\": [{\"departmentId\": \"${OFFICE[0]}\", \"minimumAmount\": 900000}]
}")
check "PATCH distribution exceeding goal -> 400" "400" "$CODE"

echo "=== completed campaign rejects new records ==="
curl -s -b "$JAR" -o /dev/null -X PATCH "$BASE/api/donation-campaigns/$CID" -H "Content-Type: application/json" -d '{"status":"COMPLETED"}'
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/donation-campaigns/$CID/donations" -H "Content-Type: application/json" -d "{
  \"departmentId\": \"${OFFICE[0]}\", \"reportDate\": \"$TODAY\", \"cashAmount\": 100
}")
check "record on COMPLETED campaign -> 400" "400" "$CODE"
curl -s -b "$JAR" -o /dev/null -X PATCH "$BASE/api/donation-campaigns/$CID" -H "Content-Type: application/json" -d '{"status":"ACTIVE"}'

echo "=== entry removal (admin) ==="
ENTRY_ID=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns/$CID/donations?departmentId=${OFFICE[1]}" | python3 -c "import json,sys;print(json.load(sys.stdin)['data'][0]['id'])")
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/donation-campaigns/$CID/donations/$ENTRY_ID")
check "delete entry" "200" "$CODE"
check "collected after removal" "85000" "$(curl -s -b "$JAR" "$BASE/api/donation-campaigns/$CID" | python3 -c "import json,sys;print(json.load(sys.stdin)['analysis']['collected'])")"
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/donation-campaigns/$CID/donations/$ENTRY_ID")
check "delete again -> 404" "404" "$CODE"

echo "=== campaign list ==="
LIST=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns")
FOUND=$(echo "$LIST" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(1 if any(x['id']=='$CID' for x in d) else 0)")
check "campaign in list" "1" "$FOUND"
check "list carries analysis" "1" "$(echo "$LIST" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(1 if all('analysis' in x for x in d) else 0)")"

echo "=== cleanup (delete E2E campaign, cascade) ==="
CODE=$(curl -s -b "$JAR" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/donation-campaigns/$CID")
check "delete campaign" "200" "$CODE"
LEFT=$(curl -s -b "$JAR" "$BASE/api/donation-campaigns" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(sum(1 for x in d if 'E2E-TEST' in x['name']))")
check "no E2E-TEST campaigns left" "0" "$LEFT"
ENTRY_LEFT=$(curl -s -b "$JAR" "$BASE/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin)['records']['DonationEntry'])")
check "DonationEntry table back to baseline" "0" "$ENTRY_LEFT"

echo ""
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ] && echo "ALL CHECKS PASSED" || exit 1
