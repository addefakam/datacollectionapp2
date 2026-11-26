#!/usr/bin/env bash
# Cleanup: delete the duplicate "E2E Industry Status Test" records created by E2E runs.
set -u
cd "$(dirname "$0")/.."
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1
NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/cleanup-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -sf "$BASE/api/health" > /dev/null 2>&1 && break; sleep 1; done

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
agent-browser set viewport 1440 1400
agent-browser open "$BASE/"
agent-browser wait --load networkidle
for i in $(seq 1 15); do agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null && break; sleep 2; done
agent-browser find placeholder "Enter your password" fill "admin123"
agent-browser find role button click --name "Sign In"
sleep 3
agent-browser find role button click --name "Not now" 2>/dev/null || true

agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Industry').forEach(b => b.click()); 'ok'" > /dev/null
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Records').forEach(b => b.click()); 'ok'" > /dev/null
sleep 2

for round in 1 2 3 4 5; do
  n=$(agent-browser eval "Array.from(document.querySelectorAll('tbody tr')).filter(tr => tr.textContent.includes('E2E Industry Status Test')).length" | jclean)
  echo "round $round: $n E2E row(s)"
  [ "$n" = "0" ] && break
  agent-browser eval "(() => {
    const row = Array.from(document.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes('E2E Industry Status Test'));
    if (!row) return 'no-row';
    const btn = Array.from(row.querySelectorAll('button')).find(b => (b.title || '') === 'Delete');
    if (!btn) return 'no-delete-btn';
    btn.click();
    return 'delete-clicked';
  })()" | jclean
  sleep 1
  agent-browser eval "(() => {
    const dlg = document.querySelector('[role=\"alertdialog\"]');
    if (!dlg) return 'no-dialog';
    const btn = Array.from(dlg.querySelectorAll('button')).find(b => b.textContent.trim() === 'Delete');
    if (!btn) return 'no-confirm';
    btn.click();
    return 'confirmed';
  })()" | jclean
  sleep 2
done
echo "cleanup done"
