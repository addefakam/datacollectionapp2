#!/usr/bin/env bash
# Reproduce the verify flow (fill → select) with rich Radix diagnostics.
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
if agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean | rg -q 'form'; then
  agent-browser find placeholder "Enter your username" fill "admin"
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser find role button click --name "Not now" 2>/dev/null || true
fi
# exact verify navigation
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Hotel')" > /dev/null
sleep 1
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Survey' && b.closest('[data-slot=\"accordion-content\"]'))"
sleep 1.5
echo "--- how many survey-progress / subCity / which tab active ---"
agent-browser eval "(() => JSON.stringify({
  progress: document.querySelectorAll('[data-slot=\"survey-progress\"]').length,
  subCityCount: document.querySelectorAll('#subCity').length,
  orgCount: document.querySelectorAll('#organizationName').length,
}))()" | jclean

# fill org like verify does
agent-browser eval "(() => {
  const el = document.querySelector('#organizationName');
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  desc.set.call(el, 'ELEGANT VIEW HOTEL');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'filled';
})()" | jclean
sleep 0.5

echo "--- open subCity and diagnose ---"
pointer_seq "document.querySelector('#subCity')"
sleep 0.8
agent-browser eval "(() => JSON.stringify({
  expanded: document.querySelector('#subCity')?.getAttribute('aria-expanded'),
  options: document.querySelectorAll('[role=\"option\"]').length,
  listboxInDoc: document.querySelectorAll('[role=\"listbox\"]').length,
  optTexts: Array.from(document.querySelectorAll('[role=\"option\"]')).map(o => o.textContent.trim()),
}))()" | jclean

echo "--- dispatch pd+pu on Debaayyuu option ---"
agent-browser eval "(() => {
  const opt = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('Debaayyuu'));
  if (!opt) return 'no-option';
  const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
  opt.dispatchEvent(new PointerEvent('pointerdown', { ...opts, buttons: 1 }));
  setTimeout(() => opt.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 })), 60);
  return 'item-dispatched';
})()" | jclean
sleep 1
agent-browser eval "(() => JSON.stringify({
  triggerText: (document.querySelector('#subCity')?.textContent || '').trim(),
  expanded: document.querySelector('#subCity')?.getAttribute('aria-expanded'),
  optionsLeft: document.querySelectorAll('[role=\"option\"]').length,
}))()" | jclean
