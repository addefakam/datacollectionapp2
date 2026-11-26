#!/usr/bin/env bash
# Browser E2E: the Small Enterprise Manage tab shows ONLY the "Survey
# Questions — Small Enterprise / Gaaffii Safiisaa" section — the performance
# dashboard (and everything else) that used to sit above it is removed.
#
# Read-only against production data: navigation and text reads only.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-manage-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-manage-server.log 2>&1 &
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
jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

# --- open the Small Enterprise Manage tab -------------------------------------
click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
click_item "Manage"
sleep 2
agent-browser wait --load networkidle

manage_raw=$(agent-browser eval "(() => {
  const body = document.body.innerText;
  return JSON.stringify({
    surveyQuestions: body.includes('Survey Questions'),
    gaaffii: body.includes('Gaaffii Safiisaa'),
    perfDashboard: body.includes('SME Performance Dashboard'),
    targetVsRegistered: body.includes('Target vs Registered'),
    operationalProgress: body.includes('Operational Progress'),
    byEnterpriseType: body.includes('By Enterprise Type')
  });
})()")
manage_json=$(echo "$manage_raw" | jclean)
echo "manage tab: $manage_json"
echo "$manage_json" | rg -q '"surveyQuestions":true' && ok "Survey Questions section present" || bad "Survey Questions section missing ($manage_json)"
echo "$manage_json" | rg -q '"gaaffii":true' && ok "bilingual title (Gaaffii Safiisaa) present" || bad "Gaaffii Safiisaa missing ($manage_json)"
echo "$manage_json" | rg -q '"perfDashboard":false' && ok "SME Performance Dashboard removed from Manage tab" || bad "performance dashboard still on Manage tab ($manage_json)"
echo "$manage_json" | rg -q '"targetVsRegistered":false' && ok "'Target vs Registered' chart removed" || bad "'Target vs Registered' still present ($manage_json)"
echo "$manage_json" | rg -q '"operationalProgress":false' && ok "'Operational Progress' chart removed" || bad "'Operational Progress' still present ($manage_json)"
echo "$manage_json" | rg -q '"byEnterpriseType":false' && ok "'By Enterprise Type' chart removed" || bad "'By Enterprise Type' still present ($manage_json)"
agent-browser screenshot --full-page "$SHOTS/manage-tab.png" > /dev/null 2>&1 || agent-browser screenshot "$SHOTS/manage-tab.png" > /dev/null 2>&1

# --- sanity: the standalone Performance Dashboard tab still works -------------
# (it fetches several APIs first and shows skeletons until loaded — poll for it)
click_item "Performance Dashboard"
dash_present=0
for i in $(seq 1 20); do
  sleep 1
  state=$(agent-browser eval "document.body.innerText.includes('SME Performance Dashboard') ? 'present' : 'loading'" | jclean)
  [ "$state" = "present" ] && { dash_present=1; break; }
done
echo "dashboard tab: $state"
[ "$dash_present" = "1" ] && ok "Performance Dashboard still available on its own tab" || bad "Performance Dashboard tab broken"

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
