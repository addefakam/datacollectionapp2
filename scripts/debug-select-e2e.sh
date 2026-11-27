#!/usr/bin/env bash
# Debug the Radix Select opening behaviour on the survey E2E setup.
set -u
cd "$(dirname "$0")/.."
export DATABASE_URL="postgresql://pgadmin@127.0.0.1:54329/e2e_sme"
PORT=3361
BASE="http://localhost:$PORT"

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
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

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/debug-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; pkill -f "next-server" 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf "$BASE/api/health" > /dev/null 2>&1 && break; sleep 1; done
echo "server up (pid $SRV)"

agent-browser set viewport 1440 1400
agent-browser open "$BASE/" > /dev/null 2>&1
agent-browser wait --load networkidle
sleep 2
# login if needed
if agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean | rg -q 'form'; then
  agent-browser find placeholder "Enter your username" fill "admin"
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser find role button click --name "Not now" 2>/dev/null || true
fi
# navigate to Hotel → Survey
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Hotel')" > /dev/null
sleep 0.6
pointer_seq "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Survey')[0]" > /dev/null
sleep 1.5
agent-browser eval "(() => document.querySelector('#subCity') ? 'on-survey' : 'not-on-survey')()" | jclean

echo "--- option count right after pointer_seq on #subCity ---"
pointer_seq "document.querySelector('#subCity')"
sleep 1
agent-browser eval "(() => JSON.stringify({ options: document.querySelectorAll('[role=\"option\"]').length, listbox: !!document.querySelector('[role=\"listbox\"]'), expanded: document.querySelector('#subCity')?.getAttribute('aria-expanded'), triggerText: (document.querySelector('#subCity')?.textContent||'').trim() }))()" | jclean

echo "--- press Escape then try agent-browser native click (trusted CDP events) ---"
agent-browser press Escape > /dev/null 2>&1 || true
sleep 0.5
agent-browser find role combobox click --name "Select / Filadhu" 2>&1 | head -2
sleep 1
agent-browser eval "(() => JSON.stringify({ options: document.querySelectorAll('[role=\"option\"]').length }))()" | jclean

echo "--- list first options if any ---"
agent-browser eval "(() => JSON.stringify(Array.from(document.querySelectorAll('[role=\"option\"]')).map(o => o.textContent.trim()).slice(0, 5)))()" | jclean

echo "--- keyboard path: focus trigger, ArrowDown, Enter ---"
pointer_seq "document.querySelector('#subCity')"
sleep 0.8
agent-browser press ArrowDown > /dev/null 2>&1 || true
sleep 0.5
agent-browser press Enter > /dev/null 2>&1 || true
sleep 0.8
agent-browser eval "(() => JSON.stringify({ triggerText: (document.querySelector('#subCity')?.textContent||'').trim(), options: document.querySelectorAll('[role=\"option\"]').length }))()" | jclean

echo "--- reopen and test synthetic KeyboardEvent Enter on the option ---"
agent-browser press Escape > /dev/null 2>&1 || true; sleep 0.5
pointer_seq "document.querySelector('#subCity')"
sleep 0.8
agent-browser eval "(() => {
  const opt = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('Debaayyuu'));
  if (!opt) return 'no-option';
  const tgt = opt.querySelector('[role=\"presentation\"]') || opt;
  tgt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return 'enter-dispatched';
})()" | jclean
sleep 0.8
agent-browser eval "(() => JSON.stringify({ triggerText: (document.querySelector('#subCity')?.textContent||'').trim() }))()" | jclean

echo "--- reopen and test synthetic pointerdown-only then pointerup-only on item ---"
agent-browser press Escape > /dev/null 2>&1 || true; sleep 0.5
pointer_seq "document.querySelector('#subCity')"
sleep 0.8
agent-browser eval "(() => {
  const opt = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('Debaayyuu'));
  if (!opt) return 'no-option';
  const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
  opt.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
  setTimeout(() => opt.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 })), 60);
  return 'pd-pu-dispatched';
})()" | jclean
sleep 1
agent-browser eval "(() => JSON.stringify({ triggerText: (document.querySelector('#subCity')?.textContent||'').trim() }))()" | jclean

