#!/usr/bin/env bash
# Browser E2E: Small Enterprise Registration & Performance Monitoring module.
# - Sidebar shows the SME pages incl. new "Set Targets" + "Performance Dashboard"
# - Set Targets: create a city-wide yearly target via the UI, distribute it to sub-cities
# - Performance Dashboard: KPIs, charts, accountability table + click-through detail
# - Records: status badges + Update Status dialog
# - Survey: "Current Status" select at registration
# All test data (targets + E2E test SME records) is cleaned up at the end.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3317
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-monitor-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-monitor-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

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
agent-browser find role button click --name "Not now" 2>/dev/null || true
echo "logged in"

# Helper: click every sidebar button whose exact label matches (desktop + mobile copies)
click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

# Helper: unwrap agent-browser eval output (a JSON-quoted string literal),
# keeping the last non-empty line.
unq() {
  python3 -c '
import sys, json
raw = sys.stdin.read().strip()
lines = [l for l in raw.splitlines() if l.strip()]
val = lines[-1] if lines else ""
if val.startswith(chr(34)) and val.endswith(chr(34)):
    try:
        val = json.loads(val)
    except Exception:
        pass
print(val)'
}

# --- expand Initiatives → Small Enterprise --------------------------------
click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
agent-browser read > "$SHOTS/1-sidebar.txt" 2>&1
agent-browser screenshot "$SHOTS/1-sidebar.png" > /dev/null 2>&1

for t in "Survey" "Records" "Set Targets" "Performance Dashboard" "Stats" "Goals"; do
  if grep -q "$t" "$SHOTS/1-sidebar.txt"; then
    echo "PASS: sidebar has '$t'"
  else
    echo "FAIL: sidebar missing '$t'"
  fi
done

# --- baseline target ids (for cleanup) ------------------------------------
# FULL response (no truncation): a truncated payload once parsed as an empty
# baseline, so the cleanup step deleted EVERY production target. The cleanup
# below also refuses to run when the baseline is empty (fail-safe).
agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme-targets',false);x.send();x.responseText.slice(0,500000)" > "$SHOTS/baseline.json" 2>&1
BASELINE_IDS=$(python3 - <<'PY'
import json
raw = open('/tmp/sme-monitor-shots/baseline.json').read().strip()
if raw.startswith('"'):
    try:
        raw = json.loads(raw)
    except Exception:
        pass
try:
    start = raw.index('[')
    end = raw.rindex(']') + 1
    data = json.loads(raw[start:end])
except Exception:
    data = []
print(','.join(t['id'] for t in data if isinstance(t, dict) and 'id' in t))
PY
)
echo "baseline targets: ${BASELINE_IDS:-none}"
TARGET_CLEANUP=1
[ -n "$BASELINE_IDS" ] || { echo "WARN: empty baseline — target cleanup will be SKIPPED (fail-safe)"; TARGET_CLEANUP=0; }

# --- Set Targets page: create a city-wide yearly target --------------------
click_item "Set Targets"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/2-targets.txt" 2>&1
grep -q "SME Establishment Targets" "$SHOTS/2-targets.txt" \
  && echo "PASS: Set Targets page renders" \
  || echo "FAIL: Set Targets page missing header"

agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Set Target')[0].click(); 'open'" > /dev/null 2>&1
sleep 1
agent-browser fill "#sme-target-value" "24" > /dev/null 2>&1
# Yearly period of 2027 — never collides with the real production targets
# (which live in 2026), so the duplicate guard cannot reject the test target.
# React-controlled input: set the value through the native setter + events.
agent-browser eval "var el=document.querySelector('#sme-ref-date');var st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(el,'2027-01-15');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));'ref-set'" > /dev/null 2>&1
sleep 0.5
# submit: the dialog footer "Set Target" button (last match in DOM)
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Set Target').pop().click(); 'saved'" > /dev/null 2>&1
sleep 2
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/2-targets-created.txt" 2>&1
if grep -q "City-wide (all sub-cities)" "$SHOTS/2-targets-created.txt" && grep -q "Target 24 enterprises" "$SHOTS/2-targets-created.txt"; then
  echo "PASS: city-wide yearly target created via UI (24 enterprises)"
else
  echo "FAIL: city-wide target card not found after creation"
fi
agent-browser screenshot "$SHOTS/2-target-created.png" > /dev/null 2>&1

# --- distribute the city target to sub-cities -------------------------------
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Distribute')).length > 0 ? (Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Distribute').click(), 'open') : 'no-button'" > "$SHOTS/distribute-open.txt" 2>&1
sleep 1
agent-browser read > "$SHOTS/3-distribute.txt" 2>&1
if grep -q "Distribute to Sub-Cities" "$SHOTS/3-distribute.txt"; then
  echo "PASS: distribution dialog lists sub-cities"
else
  echo "FAIL: distribution dialog did not open"
fi
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Save Distribution').pop().click(); 'saving'" > /dev/null 2>&1
sleep 2
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/3-distributed.txt" 2>&1
if grep -q "Sub-city" "$SHOTS/3-distributed.txt"; then
  echo "PASS: sub-city targets created by distribution"
else
  echo "FAIL: no sub-city target cards after distribution"
fi
agent-browser screenshot "$SHOTS/3-distributed.png" > /dev/null 2>&1

# --- Performance Dashboard ---------------------------------------------------
click_item "Performance Dashboard"
sleep 4
agent-browser wait --load networkidle
# Point the dashboard at the test period (yearly 2027) so the 24-enterprise
# target created above is the one shown as the city-wide target.
agent-browser eval "var el=document.querySelector('#sme-perf-ref');var st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(el,'2027-01-15');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));'ref-set'" > /dev/null 2>&1
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/4-dashboard.txt" 2>&1
for t in "SME Performance Dashboard" "Assigned Target" "Target vs Registered" "Accountability per Sub-City" "City-wide target: 24 enterprises"; do
  if grep -q "$t" "$SHOTS/4-dashboard.txt"; then
    echo "PASS: dashboard shows '$t'"
  else
    echo "FAIL: dashboard missing '$t'"
  fi
done
agent-browser screenshot "$SHOTS/4-dashboard.png" > /dev/null 2>&1

# --- register 3 test SMEs via the API (in the first sub-city of the table) ---
FIRST_UNIT=$(agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme/performance?periodType=yearly',false);x.send();var j=JSON.parse(x.responseText);j.rows && j.rows.length ? (j.rows[0].subCity + '|' + (j.kpis.totalRegistered||0)) : 'NO-ROWS'" 2>/dev/null | unq)
SC="${FIRST_UNIT%%|*}"
echo "first unit: $SC"
for rec in "Alpha|REGISTERED" "Beta|FULLY_LEGALIZED" "Gamma|OPERATIONAL"; do
  NAME="E2E TEST SME ${rec%%|*}"; ST="${rec##*|}"
  RES=$(agent-browser eval "var x=new XMLHttpRequest();x.open('POST','/api/smallenterprises',false);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify({enterpriseName:'$NAME',enterpriseType:'Retail Trade',ownershipType:'Private',subCity:'$SC',area:'E2E Woreda',specificAddress:'E2E test address',employeeCount:6,maleEmployees:2,femaleEmployees:4,status:'$ST',contactName:'E2E Contact',contactPhone:'0912345678',surveyorName:'E2E'}));x.status + ':' + x.responseText.slice(0,60)" 2>/dev/null | unq)
  case "$RES" in
    201:*) echo "PASS: registered $NAME ($ST)" ;;
    *) echo "FAIL: $NAME registration -> $RES" ;;
  esac
done

# --- performance API reflects the registrations ------------------------------
agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme/performance?periodType=yearly',false);x.send();x.responseText.slice(0,8000)" > "$SHOTS/perf.json" 2>&1
PERF_CHECK=$(python3 - <<'PY'
import json
raw = open('/tmp/sme-monitor-shots/perf.json').read().strip()
if raw.startswith('"'):
    try:
        raw = json.loads(raw)
    except Exception:
        pass
try:
    start = raw.index('{')
    end = raw.rindex('}') + 1
    j = json.loads(raw[start:end])
except Exception:
    j = {}
k = j.get('kpis', {})
bs = j.get('totals', {}).get('byStatus', {})
ok = k.get('totalRegistered', 0) >= 3 and bs.get('REGISTERED', 0) >= 1 \
     and bs.get('FULLY_LEGALIZED', 0) >= 1 and bs.get('OPERATIONAL', 0) >= 1 \
     and k.get('members', 0) >= 18 and k.get('femaleMembers', 0) >= 12
target_row = next((r for r in j.get('rows', []) if r.get('actual', 0) >= 3), None)
print('PERF-OK' if ok and target_row else 'PERF-FAIL: ' + json.dumps({'kpis': k, 'byStatus': bs}))
PY
)
if [ "$PERF_CHECK" = "PERF-OK" ]; then
  echo "PASS: performance API counts registrations, statuses and members"
else
  echo "FAIL: performance API analysis wrong: $PERF_CHECK"
fi

# refresh the dashboard and open the click-through detail
click_item "Performance Dashboard"
sleep 4
agent-browser wait --load networkidle
UNIT_LABEL=$(agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme/performance?periodType=yearly',false);x.send();var j=JSON.parse(x.responseText);var r=(j.rows||[]).find(r=>r.actual>=3);r?r.subCity:'NONE'" 2>/dev/null | unq)
agent-browser eval "var trs=Array.from(document.querySelectorAll('tbody tr'));var tr=trs.find(t=>t.textContent.includes('$UNIT_LABEL'));tr? (tr.click(),'clicked') : 'no-row'" > "$SHOTS/detail-open.txt" 2>&1
sleep 2
agent-browser read > "$SHOTS/5-detail.txt" 2>&1
if grep -q "Performance detail" "$SHOTS/5-detail.txt" && grep -q "Registered enterprises" "$SHOTS/5-detail.txt" && grep -q "E2E TEST SME Alpha" "$SHOTS/5-detail.txt"; then
  echo "PASS: click-through detail shows target summary + the unit's enterprises"
else
  echo "FAIL: click-through detail dialog incomplete"
fi
agent-browser screenshot "$SHOTS/5-detail.png" > /dev/null 2>&1
agent-browser press Escape > /dev/null 2>&1
sleep 1

# --- Records page: status badge + Update Status dialog -----------------------
click_item "Records"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/6-records.txt" 2>&1
grep -q "E2E TEST SME" "$SHOTS/6-records.txt" && echo "PASS: records list shows test SMEs" || echo "FAIL: test SMEs not in records"
grep -q "Operational" "$SHOTS/6-records.txt" && echo "PASS: status badges visible in records" || echo "FAIL: status badges missing"

agent-browser click 'button[title="Update Status"]' > /dev/null 2>&1
sleep 1
agent-browser read > "$SHOTS/6-status-dialog.txt" 2>&1
if grep -q "Update Establishment Status" "$SHOTS/6-status-dialog.txt"; then
  echo "PASS: Update Status dialog opens"
else
  echo "FAIL: Update Status dialog did not open"
fi
# choose "Registered" in the select, then save
agent-browser eval "var trig=document.querySelector('[role=\"dialog\"] button[role=\"combobox\"]');trig? (trig.click(),'open') : 'no-trigger'" > /dev/null 2>&1
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('[role=\"option\"]')).find(o => o.textContent.includes('Registered')) ? (Array.from(document.querySelectorAll('[role=\"option\"]')).find(o => o.textContent.includes('Registered')).click(),'picked') : 'no-option'" > /dev/null 2>&1
sleep 0.5
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Save Status').pop().click(); 'saving'" > /dev/null 2>&1
sleep 2
agent-browser read > "$SHOTS/6-status-saved.txt" 2>&1
grep -q "Status Updated" "$SHOTS/6-status-saved.txt" \
  && echo "PASS: status update saved with toast" \
  || echo "FAIL: status update toast missing"

# --- Survey page: Current Status select ---------------------------------------
click_item "Survey"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/7-survey.txt" 2>&1
if grep -q "Current Status" "$SHOTS/7-survey.txt" && grep -q "Sadarkaa Ammaa" "$SHOTS/7-survey.txt"; then
  echo "PASS: survey form has the Current Status select"
else
  echo "FAIL: survey form missing Current Status field"
fi
agent-browser screenshot "$SHOTS/7-survey.png" > /dev/null 2>&1

# --- cleanup: remove targets + SME records created by this test ---------------
# Target deletion only runs when a non-empty baseline was captured; production
# targets must never be touched by a test run.
if [ "$TARGET_CLEANUP" = "1" ]; then
  CLEANUP=$(agent-browser eval "var keep='$BASELINE_IDS'.split(',').filter(Boolean);var x=new XMLHttpRequest();x.open('GET','/api/sme-targets',false);x.send();var ts=JSON.parse(x.responseText).data||[];var dt=0;for(var i=0;i<ts.length;i++){if(keep.indexOf(ts[i].id)<0){var d=new XMLHttpRequest();d.open('DELETE','/api/sme-targets/'+ts[i].id,false);d.send();dt++;}}var y=new XMLHttpRequest();y.open('GET','/api/smallenterprises?search=E2E%20TEST%20SME&limit=100',false);y.send();var ss=JSON.parse(y.responseText).data||[];var ds=0;for(var j=0;j<ss.length;j++){var e=new XMLHttpRequest();e.open('DELETE','/api/smallenterprises/'+ss[j].id,false);e.send();ds++;}'deleted targets:'+dt+', smes:'+ds" 2>/dev/null | unq)
  echo "cleanup: $CLEANUP"
else
  echo "cleanup: SKIPPED target deletion (empty baseline fail-safe); removing only E2E test SMEs"
  CLEANUP=$(agent-browser eval "var y=new XMLHttpRequest();y.open('GET','/api/smallenterprises?search=E2E%20TEST%20SME&limit=100',false);y.send();var ss=JSON.parse(y.responseText).data||[];var ds=0;for(var j=0;j<ss.length;j++){var e=new XMLHttpRequest();e.open('DELETE','/api/smallenterprises/'+ss[j].id,false);e.send();ds++;}'deleted smes:'+ds" 2>/dev/null | unq)
  echo "cleanup: $CLEANUP"
fi

ERRS=$(agent-browser errors 2>/dev/null | head -1)
if [ -z "$ERRS" ]; then
  echo "PASS: no client-side page errors"
else
  echo "WARN: page errors detected: $ERRS"
fi

echo "SME-MONITOR E2E DONE"
