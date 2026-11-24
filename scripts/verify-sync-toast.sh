#!/bin/bash
# E2E: the manual "Sync now" button must TELL THE TRUTH about sync outcomes.
#  - queued record + server down  -> destructive toast "Sync failed" (badge stays)
#  - server back up + Sync now    -> success toast "Synced" (badge clears, row lands)
# Runs the PRODUCTION standalone build on port 3000 (same as deployment).
set -e
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "standalone/server.js" 2>/dev/null || true
agent-browser close 2>/dev/null || true
sleep 1

# Mirror build.sh artifact assembly: standalone alone has NO .next/static and
# no public/ — without them JS chunks 404, hydration never runs and the page
# sticks on the SSR "Loading..." shell. (Deployment copies these the same way.)
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

export NODE_ENV=production PORT=3000
export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NEXTAUTH_URL="http://localhost:3000"
export NEXTAUTH_SECRET=e2e-secret

node .next/standalone/server.js > /tmp/e2e-toast-server.log 2>&1 &
SRV=$!
kill_srv() { kill -9 $SRV 2>/dev/null || true; }
trap 'kill_srv; agent-browser close 2>/dev/null || true' EXIT

code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "server up: $code"

agent-browser set viewport 1440 900
agent-browser open http://localhost:3000
agent-browser wait --load networkidle

# --- login (retry until hydration renders the form) ---
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

wait_for_sync_btn() {
  # poll up to ~25s: the badge appears after a sync attempt refreshes the count
  local found=0
  for i in $(seq 1 25); do
    if agent-browser find text "Sync now" click 2>/dev/null; then found=1; break; fi
    sleep 1
  done
  [ "$found" = "1" ] || { echo "FAIL: Sync now button never appeared"; return 1; }
}

# sanity: session really established
SESS=$(agent-browser eval "fetch('/api/auth/session').then(r=>r.json()).then(s=>s&&s.user?s.user.username||'named':'none')" --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('result',d))" 2>/dev/null || echo "?")
echo "logged in as: $SESS"

# --- inject a queued small-enterprise record into IndexedDB ---
agent-browser eval "
(() => new Promise((res, rej) => {
  const req = indexedDB.open('bgh-survey-offline', 1);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('pending_surveys')) {
      const st = db.createObjectStore('pending_surveys', { keyPath: 'id', autoIncrement: true });
      st.createIndex('createdAt', 'createdAt', { unique: false });
    }
  };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('pending_surveys', 'readwrite');
    tx.objectStore('pending_surveys').add({
      kind: 'small-enterprise',
      data: {
        enterpriseName: 'E2E TOAST PROOF', enterpriseType: 'Trade', ownershipType: 'private',
        subCity: 'Bishoftu', area: '01', specificAddress: 'e2e street',
        contactName: 'E2E Contact', contactPhone: '0911999999', employeeCount: 2
      },
      createdAt: new Date().toISOString(), retryCount: 0
    });
    tx.oncomplete = () => res('queued');
    tx.onerror = () => rej('inject-failed');
  };
  req.onerror = () => rej('open-failed');
}))()
" --json 2>/dev/null || echo "inject returned non-json"
sleep 2

# badge appears? (15s auto-sync may also fire here — server is UP so it may
# sync instantly; that is FINE, we kill the server right away and inject a
# SECOND record for the failure leg)
echo "--- badge state after inject (server up): ---"
agent-browser snapshot -c | grep -i "pending\|Sync" | head -5 || echo "(no badge)"

# --- kill server IMMEDIATELY (before the 15s auto tick), inject 2nd record ---
kill_srv
sleep 1
agent-browser eval "
(() => new Promise((res, rej) => {
  const req = indexedDB.open('bgh-survey-offline', 1);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('pending_surveys', 'readwrite');
    tx.objectStore('pending_surveys').add({
      kind: 'small-enterprise',
      data: {
        enterpriseName: 'E2E FAIL LEG', enterpriseType: 'Trade', ownershipType: 'private',
        subCity: 'Bishoftu', area: '01', specificAddress: 'e2e street',
        contactName: 'E2E Contact', contactPhone: '0911999998', employeeCount: 1
      },
      createdAt: new Date().toISOString(), retryCount: 0
    });
    tx.oncomplete = () => res('queued2');
    tx.onerror = () => rej('inject2-failed');
  };
  req.onerror = () => rej('open2-failed');
}))()
" --json 2>/dev/null || true
sleep 2

echo "=== click Sync now with server DOWN ==="
wait_for_sync_btn || exit 1
sleep 3
agent-browser screenshot /tmp/e2e-toast-fail.png
echo "--- toast text (fail leg): ---"
agent-browser get text "body" | grep -io "sync failed[^\"]*\|could not reach the server[^\"]*" | head -3 || echo "(no fail toast found)"

echo "=== restart server, click Sync now again ==="
node .next/standalone/server.js >> /tmp/e2e-toast-server.log 2>&1 &
SRV=$!
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
echo "server back: $code"

wait_for_sync_btn || true
sleep 4
agent-browser screenshot /tmp/e2e-toast-success.png
echo "--- toast text (success leg): ---"
agent-browser get text "body" | grep -io "synced[^\"]*\|saved to the database[^\"]*" | head -3 || echo "(no success toast found)"
echo "--- badge state (should be no pending): ---"
agent-browser snapshot -c | grep -i "pending" | head -3 || echo "(badge gone — OK)"

echo "=== DB rows ==="
python3 - <<'EOF'
import sqlite3
con = sqlite3.connect('/home/z/my-project/db/custom.db')
rows = con.execute("SELECT enterpriseName FROM SmallEnterprise WHERE enterpriseName LIKE 'E2E %'").fetchall()
print("synced E2E rows:", [r[0] for r in rows])
EOF

echo "E2E TOAST DONE"
