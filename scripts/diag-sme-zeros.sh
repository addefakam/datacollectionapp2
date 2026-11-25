#!/usr/bin/env bash
# Diagnose: SME status cards show all zeros while real records exist.
# Boots the production build against the real database, logs in, opens the
# Performance Dashboard + Set Targets pages, captures text + screenshots and
# dumps the raw API payloads for both endpoints.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-diag-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=diag-secret \
  node .next/standalone/server.js > /tmp/sme-diag-server.log 2>&1 &
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
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Not now').forEach(b => b.click()); 'ok'" > /dev/null 2>&1
echo "logged in"

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

click_item "Initiatives"; sleep 1
click_item "Small Enterprise"; sleep 1

# --- Performance Dashboard ----------------------------------------------------
click_item "Performance Dashboard"
sleep 4
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/dashboard.txt" 2>&1
echo "===== DASHBOARD TEXT (status-relevant lines) ====="
grep -nE "Registered|Fully Legalized|Awaiting|Operational|Pending|Members|Target|period|elapsed" "$SHOTS/dashboard.txt" | head -40
agent-browser screenshot "$SHOTS/dashboard.png" > /dev/null 2>&1

# --- Set Targets page ----------------------------------------------------------
click_item "Set Targets"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/targets.txt" 2>&1
echo "===== TARGETS TEXT (status-relevant lines) ====="
grep -nE "Registered|Fully Legalized|Awaiting|Operational|members|Target [0-9]|of target" "$SHOTS/targets.txt" | head -40
agent-browser screenshot "$SHOTS/targets.png" > /dev/null 2>&1

# --- raw API payloads -----------------------------------------------------------
echo "===== /api/sme/performance (yearly) ====="
agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme/performance?periodType=yearly',false);x.send();x.status + ' :: ' + x.responseText.slice(0,1200)" 2>/dev/null
echo ""
echo "===== /api/sme-targets ====="
agent-browser eval "var x=new XMLHttpRequest();x.open('GET','/api/sme-targets',false);x.send();x.status + ' :: ' + x.responseText.slice(0,1200)" 2>/dev/null
echo ""
echo "DIAG DONE — screenshots in $SHOTS"
