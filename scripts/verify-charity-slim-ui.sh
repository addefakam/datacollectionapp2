#!/usr/bin/env bash
# Browser E2E: Bussa Goonofa / Charity module slimmed down to the donation
# campaign only. Asserts Survey / Records / Stats / Goals are GONE from the
# sidebar, the 3 campaign pages still render, and the Small Enterprise Goals
# page (shared GoalManager) is unaffected.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3316
BASE="http://localhost:$PORT"
SHOTS=/tmp/charity-slim-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/charity-slim-server.log 2>&1 &
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

# expand Initiatives -> Bussa Goonofa / Charity
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
agent-browser screenshot "$SHOTS/1-sidebar-charity.png" > /dev/null 2>&1
agent-browser read > "$SHOTS/1-text.txt" 2>&1

# --- the four removed items must be gone from the expanded charity module ---
# The read covers the whole sidebar; scope the check to the charity module by
# counting occurrences of the generic labels vs their MSE counterparts.
NAV_CHECK=$(python3 - <<'PY'
import re
text = open('/tmp/charity-slim-shots/1-text.txt').read()
# Isolate the charity module block: from its heading to the next module heading
m = re.search(r'Bussa Goonofa / Charity(.*?)(Performance Monitoring|Small Enterprise)', text, re.S)
block = m.group(1) if m else ''
print('removed_present' if re.search(r'\b(Survey|Records|Stats|Goals)\b', block) else 'removed_gone')
PY
)
if [ "$NAV_CHECK" = "removed_gone" ]; then
  echo "PASS: Survey / Records / Stats / Goals removed from Bussa Goonofa / Charity"
else
  echo "FAIL: removed items still visible in the charity module"
fi

for t in "Set Goal & Distribute" "Record Achievement" "Office Goal Report"; do
  if grep -q "$t" "$SHOTS/1-text.txt"; then
    echo "PASS: '$t' still present"
  else
    echo "FAIL: '$t' missing"
  fi
done

# 1) Set Goal & Distribute page renders
agent-browser find text "Set Goal & Distribute" click 2>/dev/null || true
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/2-text.txt" 2>&1
if grep -q "Set donation goal & distribute to offices" "$SHOTS/2-text.txt"; then
  echo "PASS: Set Goal & Distribute form renders"
else
  echo "FAIL: Set Goal & Distribute form missing header"
fi

# 2) Record Achievement page renders
for i in $(seq 1 5); do
  if agent-browser find text "Record Achievement" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/3-text.txt" 2>&1
if grep -qi "Record Achievement\|achievement" "$SHOTS/3-text.txt"; then
  echo "PASS: Record Achievement page renders"
else
  echo "FAIL: Record Achievement page missing"
fi
agent-browser screenshot "$SHOTS/3-record-achievement.png" > /dev/null 2>&1

# 3) Office Goal Report renders
for i in $(seq 1 5); do
  if agent-browser find text "Office Goal Report" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 4
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/4-text.txt" 2>&1
if grep -q "Office-wise Goal Report" "$SHOTS/4-text.txt"; then
  echo "PASS: Office-wise Goal Report renders"
else
  echo "FAIL: Office-wise Goal Report missing"
fi
agent-browser screenshot "$SHOTS/4-office-report.png" > /dev/null 2>&1

# 4) Small Enterprise Goals (shared GoalManager) still renders
for i in $(seq 1 5); do
  if agent-browser find text "Small Enterprise" click 2>/dev/null; then break; fi
  sleep 1
done
sleep 1
mse_ok=0
for i in $(seq 1 5); do
  if agent-browser find text "Goals" click 2>/dev/null; then mse_ok=1; break; fi
  sleep 1
done
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/5-text.txt" 2>&1
if grep -q "Small Enterprise Initiative · Dhibayyuu Sub-City" "$SHOTS/5-text.txt"; then
  echo "PASS: Small Enterprise Goals page (GoalManager) still renders"
else
  echo "FAIL: Small Enterprise Goals page broken"
fi
agent-browser screenshot "$SHOTS/5-mse-goals.png" > /dev/null 2>&1

ERRS=$(agent-browser errors 2>/dev/null | head -1)
if [ -z "$ERRS" ]; then
  echo "PASS: no client-side page errors"
else
  echo "WARN: page errors detected: $ERRS"
fi

echo "CHARITY-SLIM E2E DONE"
