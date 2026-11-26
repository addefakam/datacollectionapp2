#!/usr/bin/env bash
# Diagnostic v2: real pointer-event sequence (pointerdown/up + click) against
# the Columns dropdown — what an actual user click produces.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/diag-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }

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

agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Industry').forEach(b => b.click()); 'ok'" > /dev/null
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Records').forEach(b => b.click()); 'ok'" > /dev/null
sleep 2
agent-browser wait --load networkidle

state() {
  agent-browser eval "(() => {
    const ths = document.querySelectorAll('thead th').length;
    const menu = document.querySelector('[role=\"menu\"]');
    const items = menu ? Array.from(menu.querySelectorAll('[role^=\"menuitem\"]')) : [];
    return JSON.stringify({ headerCount: ths, menuOpen: !!menu, menuItems: items.length });
  })()" | jclean
}

# full real-pointer sequence dispatcher
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

echo "before: $(state)"
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Columns'))"
sleep 1
echo "after-open: $(state)"

# B) real seq on the checkbox of the last column item (above Show all)
pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role^=\"menuitem\"]')); const t = it[it.length - 2]; return t ? t.querySelector('[role=\"checkbox\"]') : null; })()"
sleep 1
echo "after-checkbox: $(state)"

# C) close + reopen, then real seq on the LABEL span of the last column item
agent-browser eval "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 'esc'" > /dev/null
sleep 1
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Columns'))"
sleep 1
pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role^=\"menuitem\"]')); const t = it[it.length - 2]; return t ? t.querySelector('span.text-xs') : null; })()"
sleep 1
echo "after-label: $(state)"

echo "done"
