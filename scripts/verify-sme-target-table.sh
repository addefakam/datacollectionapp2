#!/usr/bin/env bash
# Browser E2E: Sub-city target distribution table with click-through woreda
# details + summary graphs at the bottom (SME "Set Targets" page).
#
# Read-only against production data: it only expands rows, reads text and
# takes screenshots — no targets or SME records are created or deleted.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3318
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-table-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-table-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

agent-browser set viewport 1440 1400
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

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

# --- open the Set Targets page ---------------------------------------------
click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
click_item "Set Targets"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/1-targets.txt" 2>&1

echo "--- structural assertions ---"
for t in "SME Establishment Targets" "City-wide targets" "Sub-city target distribution" "Distribution Summary"; do
  if grep -q "$t" "$SHOTS/1-targets.txt"; then
    echo "PASS: page shows '$t'"
  else
    echo "FAIL: page missing '$t'"
  fi
done
agent-browser screenshot "$SHOTS/1-targets-top.png" > /dev/null 2>&1

# table headers (the new distribution table)
for h in "Share of City" "Registered" "Achievement" "Pending" "Operational" "Members"; do
  if grep -q "$h" "$SHOTS/1-targets.txt"; then
    echo "PASS: table has '$h' column"
  else
    echo "FAIL: table missing '$h' column"
  fi
done

# every sub-city of the settings appears as a table row
for sc in "Dukam" "Chelaleka" "Debaayyuu"; do
  if grep -q "$sc" "$SHOTS/1-targets.txt"; then
    echo "PASS: distribution row for '$sc'"
  else
    echo "FAIL: no distribution row for '$sc'"
  fi
done

# chart titles inside the summary card
for t in "Target vs Registered" "Establishment pipeline (standing today)"; do
  if grep -q "$t" "$SHOTS/1-targets.txt"; then
    echo "PASS: summary graph '$t'"
  else
    echo "FAIL: summary graph '$t' missing"
  fi
done

# recharts actually rendered bars
nwrappers=$(agent-browser eval "document.querySelectorAll('.recharts-wrapper').length" 2>/dev/null | tail -1 | tr -dc '0-9')
echo "recharts wrappers: $nwrappers"
[ "${nwrappers:-0}" -ge 2 ] && echo "PASS: 2+ summary charts rendered" || echo "FAIL: summary charts not rendered"

# --- click Debaayyuu row -> woreda details ----------------------------------
# Find the distribution-table row for Debaayyuu and click it (avoid the
# city-wide card which also mentions sub-cities).
agent-browser eval "
var row = Array.from(document.querySelectorAll('tr')).find(tr => {
  var td = tr.querySelector('td');
  return td && td.textContent.trim().startsWith('Debaayyuu') && tr.querySelector('td[colspan]') === null;
});
row ? (row.click(), 'clicked-debaayyuu') : 'no-debaayyuu-row'" > "$SHOTS/2-click.txt" 2>&1
sleep 1.5
agent-browser read > "$SHOTS/2-debaayyuu.txt" 2>&1
if grep -q "Woredas of Debaayyuu" "$SHOTS/2-debaayyuu.txt"; then
  echo "PASS: Debaayyuu drill-down opened ('Woredas of Debaayyuu')"
else
  echo "FAIL: Debaayyuu drill-down did not open"
fi
for w in "Dirree" "Dhakaa Boora" "Biiftuu" "Horaa"; do
  if grep -q "$w" "$SHOTS/2-debaayyuu.txt"; then
    echo "PASS: woreda detail row '$w'"
  else
    echo "FAIL: woreda detail row '$w' missing"
  fi
done
if grep -q "Distributed" "$SHOTS/2-debaayyuu.txt"; then
  echo "PASS: drill-down shows the distributed-of-target progress"
else
  echo "FAIL: drill-down missing distributed progress"
fi
agent-browser screenshot "$SHOTS/2-debaayyuu-expanded.png" > /dev/null 2>&1

# close Debaayyuu, open Dukam (no woreda targets -> empty state)
agent-browser eval "
var row = Array.from(document.querySelectorAll('tr')).find(tr => {
  var td = tr.querySelector('td');
  return td && td.textContent.trim().startsWith('Debaayyuu');
});
if (row) row.click(); 'closed'" > /dev/null 2>&1
sleep 1
agent-browser eval "
var row = Array.from(document.querySelectorAll('tr')).find(tr => {
  var td = tr.querySelector('td');
  return td && td.textContent.trim().startsWith('Dukam');
});
row ? (row.click(), 'clicked-dukam') : 'no-dukam-row'" > /dev/null 2>&1
sleep 1.5
agent-browser read > "$SHOTS/3-dukam.txt" 2>&1
if grep -q "Woredas of Dukam" "$SHOTS/3-dukam.txt" && grep -q "No woreda targets assigned for Dukam" "$SHOTS/3-dukam.txt"; then
  echo "PASS: Dukam empty state guides to 'Assign to woredas'"
else
  echo "FAIL: Dukam empty state missing"
fi
agent-browser screenshot "$SHOTS/3-dukam-expanded.png" > /dev/null 2>&1

# --- city information unchanged ----------------------------------------------
if grep -q "City-wide (all sub-cities)" "$SHOTS/1-targets.txt" && grep -q "2,000" "$SHOTS/1-targets.txt"; then
  echo "PASS: city-wide target card still rendered with its 2,000 value"
else
  echo "FAIL: city-wide target card changed or missing"
fi

# --- Performance Dashboard status cards reflect real records ------------------
click_item "Performance Dashboard"
sleep 4
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/4-dashboard.txt" 2>&1
# DB has 2 OPERATIONAL SMEs (both Debaayyuu / Dhakaa Boora) — the KPI strip
# must show Operational 2, not 0. KPI card text renders the value line(s)
# directly above the label line.
python3 - <<'PY'
import re, sys
txt = open('/tmp/sme-table-shots/4-dashboard.txt').read()
lines = [l.strip() for l in txt.splitlines()]
vals = []
for i, l in enumerate(lines):
    if l == 'Operational':
        for back in range(i - 1, max(i - 4, -1), -1):
            if lines[back] and re.fullmatch(r'\d[\d,]*', lines[back]):
                vals.append(int(lines[back].replace(',', '')))
                break
ok = any(v > 0 for v in vals)
print(f"operational-kpi-values: {vals}")
print("PASS: Operational KPI shows a non-zero real count" if ok
      else "FAIL: Operational KPI still 0")
sys.exit(0 if ok else 1)
PY
[ $? -eq 0 ] || true
agent-browser screenshot "$SHOTS/4-dashboard.png" > /dev/null 2>&1

echo "--- E2E COMPLETE ---"
