#!/usr/bin/env bash
# Browser E2E: sidebar behaviour —
#  1) at load time NO group/tab on the sidebar is unfolded (all collapsed),
#  2) an artistic horizontal hairline separates the top-level tabs,
#  3) opening/closing tabs by clicking still works (manual collapse sticks).
#
# Read-only against production data: navigation and text reads only.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sidebar-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

# kill anything already bound to the port (fuser is not installed here)
pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sidebar-server.log 2>&1 &
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

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

# --- 1) at load time nothing is unfolded --------------------------------------
sleep 2
load_raw=$(agent-browser eval "(() => {
  const root = document.querySelector('.sidebar-nav');
  const items = root ? Array.from(root.querySelectorAll(':scope > [data-slot=\"accordion-item\"]')) : [];
  const states = items.map(el => el.getAttribute('data-state'));
  return JSON.stringify({
    total: items.length,
    open: states.filter(s => s === 'open').length,
    closed: states.filter(s => s === 'closed').length,
    openValues: states.filter(s => s === 'open')
  });
})()")
load_json=$(echo "$load_raw" | jclean)
echo "at load: $load_json"
echo "$load_json" | rg -q '"total":7'  && ok "7 top-level tabs rendered (Industry..Initiatives..Administration)" || bad "expected 7 top-level tabs ($load_json)"
echo "$load_json" | rg -q '"open":0'   && ok "NO tab unfolded at loading time (0 open)" || bad "some tab is open at load ($load_json)"
echo "$load_json" | rg -q '"closed":7' && ok "all 7 tabs collapsed at load" || bad "not all tabs closed at load ($load_json)"

# --- 2) horizontal hairline between the tabs ----------------------------------
div_raw=$(agent-browser eval "(() => {
  const root = document.querySelector('.sidebar-nav');
  const items = Array.from(root.querySelectorAll(':scope > [data-slot=\"accordion-item\"]'));
  const withLine = items.filter(el => getComputedStyle(el, '::after').backgroundImage.includes('linear-gradient'));
  const lastEl = items[items.length - 1];
  return JSON.stringify({
    items: items.length,
    withLine: withLine.length,
    lastHasLine: getComputedStyle(lastEl, '::after').backgroundImage.includes('linear-gradient')
  });
})()")
div_json=$(echo "$div_raw" | jclean)
echo "dividers: $div_json"
echo "$div_json" | rg -q '"withLine":6'     && ok "horizontal line between each pair of tabs (6 dividers)" || bad "expected 6 dividers ($div_json)"
echo "$div_json" | rg -q '"lastHasLine":false' && ok "no dangling line after the last tab" || bad "line after last tab ($div_json)"
agent-browser screenshot "$SHOTS/sidebar-folded.png" > /dev/null 2>&1 || true

# --- 3) tabs still open/close on click ----------------------------------------
click_item "Industry"
sleep 1
ind_raw=$(agent-browser eval "(() => {
  const root = document.querySelector('.sidebar-nav');
  const items = Array.from(root.querySelectorAll(':scope > [data-slot=\"accordion-item\"]'));
  const ind = items.find(el => el.textContent.includes('Industry'));
  return JSON.stringify({
    industryOpen: ind ? ind.getAttribute('data-state') : 'missing',
    hasSurvey: ind ? ind.textContent.includes('Survey') : false,
    hasAttendance: ind ? ind.textContent.includes('Attendance') : false
  });
})()")
ind_json=$(echo "$ind_raw" | jclean)
echo "industry open: $ind_json"
echo "$ind_json" | rg -q '"industryOpen":"open"' && ok "clicking Industry unfolds it" || bad "Industry did not open ($ind_json)"
echo "$ind_json" | rg -q '"hasSurvey":true'      && ok "Industry pages visible when open" || bad "Industry pages missing ($ind_json)"

click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
se_raw=$(agent-browser eval "(() => {
  const root = document.querySelector('.sidebar-nav');
  const items = Array.from(root.querySelectorAll(':scope > [data-slot=\"accordion-item\"]'));
  const init = items.find(el => el.textContent.includes('Initiatives'));
  const nested = init ? Array.from(init.querySelectorAll('[data-slot=\"accordion-item\"]')) : [];
  const mse = nested.find(el => el.textContent.includes('Small Enterprise'));
  return JSON.stringify({
    initiativesOpen: init ? init.getAttribute('data-state') : 'missing',
    mseOpen: mse ? mse.getAttribute('data-state') : 'missing',
    mseVisible: init ? init.textContent.includes('Small Enterprise') : false,
    dashVisible: init ? init.textContent.includes('Performance Dashboard') : false
  });
})()")
se_json=$(echo "$se_raw" | jclean)
echo "initiatives open: $se_json"
echo "$se_json" | rg -q '"initiativesOpen":"open"' && ok "Initiatives tab unfolds on click" || bad "Initiatives did not open ($se_json)"
echo "$se_json" | rg -q '"mseOpen":"open"'             && ok "Small Enterprise module unfolds inside Initiatives" || bad "Small Enterprise module did not open ($se_json)"
echo "$se_json" | rg -q '"dashVisible":true'            && ok "Performance Dashboard page reachable" || bad "Small Enterprise module content missing ($se_json)"

click_item "Industry"
sleep 1
closed_raw=$(agent-browser eval "(() => {
  const root = document.querySelector('.sidebar-nav');
  const items = Array.from(root.querySelectorAll(':scope > [data-slot=\"accordion-item\"]'));
  const ind = items.find(el => el.textContent.includes('Industry'));
  const openCount = items.filter(el => el.getAttribute('data-state') === 'open').length;
  return JSON.stringify({ industryOpen: ind ? ind.getAttribute('data-state') : 'missing', openCount });
})()")
closed_json=$(echo "$closed_raw" | jclean)
echo "after collapse: $closed_json"
echo "$closed_json" | rg -q '"industryOpen":"closed"' && ok "clicking an open tab collapses it again" || bad "Industry did not close ($closed_json)"
echo "$closed_json" | rg -q '"openCount":1' && ok "only Initiatives remains open while Industry collapses (manual state sticks)" || bad "unexpected open count ($closed_json)"

agent-browser screenshot "$SHOTS/sidebar-open.png" > /dev/null 2>&1 || true

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
