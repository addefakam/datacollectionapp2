#!/usr/bin/env bash
# Browser E2E for the SME performance dashboard "Target 0, Registered 1" fix.
#
# Boots the production build against a REAL local PostgreSQL with the
# production-replica targets (CITY 2000 / SUB_CITY Debaayyuu 100 / 5 WOREDA 20,
# stored with UTC-midnight boundaries) + one registered SME.
#
# The dashboard is then verified under TWO server timezones:
#   1. TZ=UTC                  — targets were created under UTC: must match.
#   2. TZ=Africa/Addis_Ababa   — THE REPORTED BUG SCENARIO: exact datetime
#      period matching zeroed every target row here ("Target 0, Registered 1");
#      the overlap match must still resolve Target 100 / Registered 1.
#
# Asserts the API payload AND the rendered DOM (KPI cards, accountability
# table, chart titles) and captures screenshots.
set -u
cd "$(dirname "$0")/.."

bash scripts/e2e-pg-up.sh > /tmp/pg-up-e2e.log 2>&1 || { cat /tmp/pg-up-e2e.log; exit 1; }
export DATABASE_URL="postgresql://pgadmin@127.0.0.1:54329/e2e_sme"
echo "postgres up"

npx tsx scripts/seed-sme-perf-e2e.ts || exit 1

PORT=3321
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-perf-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

SRV=""
# Next.js standalone renames its process title to "next-server (v…)" — the
# original `node .next/standalone/server.js` cmdline no longer matches, so
# pkill needs BOTH patterns (leftover debug servers otherwise hold the port).
kill_sme_servers() {
  pkill -f "node .next/standalone/server.js" 2>/dev/null || true
  pkill -f "next-server" 2>/dev/null || true
  sleep 1
}
port_holder() {
  ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2
}
start_server() { # $1 = TZ, $2 = log path
  kill_sme_servers
  # wait for the port to be actually released (a leftover server otherwise
  # races the bind and the health check then hits the dying process)
  for i in $(seq 1 15); do
    curl -sf "$BASE/api/health" > /dev/null 2>&1 || break
    kill_sme_servers
    sleep 1
  done
  TZ="$1" NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
    node .next/standalone/server.js > "$2" 2>&1 &
  SRV=$!
  for i in $(seq 1 30); do
    curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
    sleep 1
  done
  curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server ($1) never healthy"; tail -5 "$2"; exit 1; }
  # the port must be held by the process we just started — a stale server
  # answering health would silently invalidate every assertion below
  local holder
  holder=$(port_holder)
  if [ "$holder" != "$SRV" ]; then
    echo "FAIL: port $PORT held by pid $holder, expected $SRV (stale server)"
    exit 1
  fi
  echo "server healthy (TZ=$1, pid $SRV)"
}

stop_server() {
  [ -n "$SRV" ] && kill "$SRV" 2>/dev/null
  kill_sme_servers
}

pointer_seq() {
  agent-browser eval "(() => {
    const el = $1;
    if (!el) return 'no-element';
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    return 'seq-done';
  })()" | jclean
}

login() {
  agent-browser set viewport 1440 1400
  agent-browser open "$BASE/"
  agent-browser wait --load networkidle
  sleep 2
  local okl=0
  for i in $(seq 1 15); do
    if agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null; then okl=1; break; fi
    # session cookie may still be valid after a server restart — already logged in
    if agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Initiatives'); return b ? 'logged-in' : 'no'; })()" | jclean | rg -q 'logged-in'; then
      okl=1; break
    fi
    sleep 2
  done
  if [ "$okl" = "1" ] && agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean | rg -q 'authed'; then
    echo "already logged in (session cookie kept)"
    return 0
  fi
  [ "$okl" = "1" ] || { echo "FAIL: login form never rendered"; exit 1; }
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser wait --load networkidle
  agent-browser find role button click --name "Not now" 2>/dev/null || true
  echo "logged in"
}

open_dashboard() {
  pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Initiatives')"
  sleep 1
  pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Small Enterprise')"
  sleep 1
  agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Performance Dashboard'); if (!b) return 'no-button'; b.click(); return 'clicked'; })()" | jclean
  sleep 4
  agent-browser wait --load networkidle
}

api_eval() { # XHR inside the logged-in session; prints the JSON
  agent-browser eval "(() => { const x = new XMLHttpRequest(); x.open('GET', '$1', false); x.send(); return x.responseText.slice(0, 400000); })()" | jclean
}

dom_eval() {
  agent-browser eval "$1" | jclean
}

assert_run() { # $1 = run label, $2 = screenshot name
  local label="$1"
  local shot="$2"

  # --- API payload ----------------------------------------------------------
  local json
  json=$(api_eval "/api/sme/performance?periodType=yearly&ref=2026-11-26")
  echo "$json" > "$SHOTS/api-$label.json"

  python3 - "$json" << 'PYEOF' > "$SHOTS/api-assert-$label.txt" 2>&1
import json, sys
data = json.loads(sys.argv[1])
rows = {r['label']: r for r in data['rows']}
print(f"cityTarget={data.get('cityTarget')} cityActual={data.get('cityActual')}")
deb = rows.get('Debaayyuu', {})
duk = rows.get('Dukam', {})
print(f"Debaayyuu target={deb.get('target')} actual={deb.get('actual')} standing={deb.get('standingTotal')}")
print(f"Dukam target={duk.get('target')} actual={duk.get('actual')}")
print(f"kpis totalTarget={data['kpis']['totalTarget']} totalRegistered={data['kpis']['totalRegistered']}")
errors = []
if data.get('cityTarget') != 2000: errors.append(f"cityTarget expected 2000, got {data.get('cityTarget')}")
if data.get('cityActual') != 1: errors.append(f"cityActual expected 1, got {data.get('cityActual')}")
if deb.get('target') != 100: errors.append(f"Debaayyuu target expected 100, got {deb.get('target')}")
if deb.get('actual') != 1: errors.append(f"Debaayyuu actual expected 1, got {deb.get('actual')}")
if deb.get('standingTotal') != 1: errors.append(f"Debaayyuu standing expected 1, got {deb.get('standingTotal')}")
if duk.get('target') != 0: errors.append(f"Dukam target expected 0, got {duk.get('target')}")
if data['kpis']['totalRegistered'] != 1: errors.append(f"totalRegistered expected 1, got {data['kpis']['totalRegistered']}")
if errors:
    print("ASSERT-ERRORS: " + "; ".join(errors)); sys.exit(1)
print("ASSERT-OK")
PYEOF

  if rg -q 'ASSERT-OK' "$SHOTS/api-assert-$label.txt"; then
    ok "$label: API payload correct (cityTarget 2000, Debaayyuu target 100 / registered 1)"
  else
    bad "$label: API payload wrong — $(cat "$SHOTS/api-assert-$label.txt" | tr '\n' ' ')"
  fi

  # --- DOM: accountability table row + chart titles + KPI card ----------------
  # The accountability table is the one whose first header is exactly "Unit"
  # (the custom report starts with "Administrative unit").
  local dom
  dom=$(dom_eval "(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    const acc = tables.find(t => {
      const ths = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim());
      return ths[0] === 'Unit' && ths[1] === 'Target' && ths[2] === 'Registered';
    });
    const row = acc ? Array.from(acc.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes('Debaayyuu')) : null;
    const cells = row ? Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim()) : [];
    const kpi = Array.from(document.querySelectorAll('div.card-lift')).find(d => d.textContent.includes('Assigned Target'));
    const titles = Array.from(document.querySelectorAll('[data-slot=card-title]')).map(t => t.textContent.trim());
    const footnote = (Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('City-wide target')) || {}).textContent || 'no-footnote';
    return JSON.stringify({ accFound: !!acc, debaayyuuCells: cells.slice(0, 4), kpi: kpi ? kpi.textContent.slice(0, 80) : 'no-kpi', titles: titles.slice(0, 8), footnote });
  })()")
  echo "$dom" > "$SHOTS/dom-$label.json"

  echo "$dom" | rg -q '"titles":\[[^\]]*Target vs Registered' && ok "$label: 'Target vs Registered' chart rendered" || bad "$label: Target vs Registered chart missing ($dom)"
  echo "$dom" | rg -q 'Operational Progress by Sub-City' && ok "$label: 'Operational Progress by Sub-City' chart rendered" || bad "$label: Operational Progress chart missing ($dom)"
  echo "$dom" | rg -q 'City-wide target' && echo "$dom" | rg -q '2,000' && ok "$label: footnote shows city-wide target 2,000" || bad "$label: city-wide footnote wrong ($dom)"
  echo "$dom" | rg -q '"accFound":true' || bad "$label: accountability table not found ($dom)"
  echo "$dom" | rg -q '"debaayyuuCells":\["Debaayyuu","100","1"' && ok "$label: accountability row Debaayyuu → Target 100, Registered 1" || bad "$label: accountability row wrong ($dom)"
  echo "$dom" | rg -q '"kpi":"100Assigned Target' && ok "$label: KPI card shows Assigned Target 100 (distributed)" || bad "$label: KPI card wrong ($dom)"

  # Headless-Chromium capture artifact: the FIRST full-page capture resizes
  # the viewport, recharts re-mounts its animation and the compositor catches
  # the bars at height 0. Retrying the capture after the animation settles
  # paints them; DOM geometry is asserted separately via the API payload and
  # the accountability table, so this only guards the visual proof.
  pixels_result="PIXELS-FAIL"
  for attempt in 1 2 3; do
    agent-browser screenshot --full "$SHOTS/$shot" > /dev/null 2>&1 || true
    sleep 2
    # pixel check of the "Target vs Registered" plot area (above the legend):
    # the 100-target bar must paint amber, the 1-registered bar teal
    pixels_result=$(python3 - "$SHOTS/$shot" << 'PYEOF' 2>&1
from PIL import Image
import numpy as np, sys
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
plot = a[440:690, 340:1370]
amber = ((plot[:,:,0]>200)&(plot[:,:,1]>120)&(plot[:,:,1]<210)&(plot[:,:,2]<90)).sum()
teal = ((plot[:,:,0]<90)&(plot[:,:,1]>110)&(plot[:,:,2]>110)).sum()
print(f"amberPx={amber} tealPx={teal} " + ("PIXELS-OK" if amber > 2000 and teal > 15 else "PIXELS-FAIL"))
PYEOF
)
    echo "$pixels_result" | rg -q 'PIXELS-OK' && break
  done
  echo "$pixels_result" > "$SHOTS/pixels-$label.txt"
  if echo "$pixels_result" | rg -q 'PIXELS-OK'; then
    ok "$label: chart bars painted (amber target bar + teal registered bar visible)"
  else
    bad "$label: bars not visible in screenshot ($pixels_result)"
  fi
}

# ===========================================================================
# Run 1 — TZ=UTC (targets created under UTC)
# ===========================================================================
start_server "UTC" /tmp/sme-perf-server-utc.log
login
open_dashboard
assert_run "utc" "dashboard-utc.png"
stop_server

# ===========================================================================
# Run 2 — TZ=Africa/Addis_Ababa (THE REPORTED BUG SCENARIO)
# ===========================================================================
start_server "Africa/Addis_Ababa" /tmp/sme-perf-server-eat.log
login
open_dashboard
assert_run "eat" "dashboard-eat.png"

# Set Targets listing under UTC+3: the overlap filter must list all 7
# production-replica targets for the period (exact matching listed none)
TJSON=$(api_eval "/api/sme-targets?periodType=yearly&ref=2026-11-26")
echo "$TJSON" > "$SHOTS/api-sme-targets.json"
python3 - "$TJSON" << 'PYEOF' > "$SHOTS/api-assert-targets.txt" 2>&1
import json, sys
data = json.loads(sys.argv[1])
rows = data.get('data', [])
sub = [t for t in rows if t['level'] == 'SUB_CITY' and t['subCity'].lower().strip() == 'debaayyuu']
city = [t for t in rows if t['level'] == 'CITY']
errors = []
if len(rows) != 7: errors.append(f"expected 7 targets, got {len(rows)}")
if not city or city[0]['targetValue'] != 2000: errors.append(f"city target expected 2000, got {[t['targetValue'] for t in city]}")
if not sub or sub[0]['targetValue'] != 100: errors.append(f"Debaayyuu target expected 100, got {[t['targetValue'] for t in sub]}")
if sub and sub[0]['progress']['actual'] != 1: errors.append(f"Debaayyuu registered expected 1, got {sub[0]['progress']['actual']}")
if errors:
    print("ASSERT-ERRORS: " + "; ".join(errors)); sys.exit(1)
print("ASSERT-OK")
PYEOF
if rg -q 'ASSERT-OK' "$SHOTS/api-assert-targets.txt"; then
  ok "UTC+3 Set Targets listing: 7 targets incl. Debaayyuu 100 / registered 1"
else
  bad "UTC+3 Set Targets listing wrong — $(cat "$SHOTS/api-assert-targets.txt" | tr '\n' ' ')"
fi
stop_server

# ===========================================================================
# Woreda drill-down under UTC+3 (WOREDA-level targets, same fix)
# ===========================================================================
start_server "Africa/Addis_Ababa" /tmp/sme-perf-server-eat2.log
login
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Initiatives')"
sleep 1
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Small Enterprise')"
sleep 1
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Performance Dashboard'); if (!b) return 'no-button'; b.click(); return 'clicked'; })()" | jclean
sleep 4
# switch level to Debaayyuu — woredas
dom_select() { agent-browser eval "$1" | jclean; }
WJSON=$(api_eval "/api/sme/performance?periodType=yearly&ref=2026-11-26&subCity=Debaayyuu")
echo "$WJSON" > "$SHOTS/api-woreda.json"
python3 - "$WJSON" << 'PYEOF' > "$SHOTS/api-assert-woreda.txt" 2>&1
import json, sys
data = json.loads(sys.argv[1])
rows = {r['label']: r for r in data['rows']}
print(f"scope={data['scope']} woredaRows={len(rows)}")
h = rows.get('Horaa', {})
print(f"Horaa target={h.get('target')} actual={h.get('actual')}")
errors = []
if data['scope'].get('level') != 'subcity': errors.append(f"scope level expected subcity, got {data['scope'].get('level')}")
if len(rows) != 5: errors.append(f"expected 5 woreda rows, got {len(rows)}")
if h.get('target') != 20: errors.append(f"Horaa target expected 20, got {h.get('target')}")
if h.get('actual') != 1: errors.append(f"Horaa actual expected 1, got {h.get('actual')}")
if errors:
    print("ASSERT-ERRORS: " + "; ".join(errors)); sys.exit(1)
print("ASSERT-OK")
PYEOF
if rg -q 'ASSERT-OK' "$SHOTS/api-assert-woreda.txt"; then
  ok "UTC+3 woreda drill-down: Horaa target 20 / registered 1"
else
  bad "UTC+3 woreda drill-down wrong — $(cat "$SHOTS/api-assert-woreda.txt" | tr '\n' ' ')"
fi
stop_server

trap 'agent-browser close 2>/dev/null || true; kill_sme_servers' EXIT

echo ""
echo "================================"
echo "E2E summary: $pass passed, $fail failed"
echo "screenshots in $SHOTS"
[ "$fail" = "0" ] || exit 1
