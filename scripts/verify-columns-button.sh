#!/usr/bin/env bash
# Browser E2E: the "Columns" button in the Records tables works —
#  1) the dropdown opens,
#  2) clicking a column ROW hides that column (header count drops, badge shows),
#  3) clicking it again restores the column,
#  4) the menu stays open while toggling,
#  5) "Show all" resets every column and closes the menu,
#  6) same behaviour verified on a second module (Health).
# Uses full real-pointer event sequences (Radix opens on pointerdown).
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/columns-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/columns-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

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

table_state() {
  agent-browser eval "(() => {
    const ths = document.querySelectorAll('thead th').length;
    const menu = document.querySelector('[role=\"menu\"]');
    const items = menu ? Array.from(menu.querySelectorAll('[role=\"menuitemcheckbox\"]')) : [];
    const badge = (Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Columns')) || {}).textContent || '';
    return JSON.stringify({
      headerCount: ths,
      menuOpen: !!menu,
      colItems: items.length,
      unchecked: items.filter(i => i.getAttribute('data-state') !== 'checked').length,
      badge: badge.replace(/[^0-9/]/g, '')
    });
  })()" | jclean
}

open_columns() {
  pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Columns'))"
  sleep 1
}

click_col_row() {
  pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role=\"menuitemcheckbox\"]')); return it[$1] || null; })()"
  sleep 1
}

# go to a module Records tab
goto_records() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'ok'" > /dev/null
  sleep 1
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Records').forEach(b => b.click()); 'ok'" > /dev/null
  sleep 2
  agent-browser wait --load networkidle
}

# ---------- Industry -----------------------------------------------------------
goto_records "Industry"
s=$(table_state); echo "industry initial: $s"
echo "$s" | rg -q '"headerCount":14' && ok "Industry table shows all 14 headers" || bad "Industry header count wrong ($s)"

open_columns
s=$(table_state); echo "industry menu: $s"
echo "$s" | rg -q '"menuOpen":true'  && ok "Columns dropdown opens" || bad "Columns dropdown did not open ($s)"
echo "$s" | rg -q '"colItems":12'    && ok "12 column rows listed" || bad "expected 12 column rows ($s)"
echo "$s" | rg -q '"unchecked":0'    && ok "all rows checked initially" || bad "some rows unchecked at start ($s)"

click_col_row 5
s=$(table_state); echo "after hide: $s"
echo "$s" | rg -q '"headerCount":13' && ok "clicking a column row hides that column (14 → 13 headers)" || bad "row click did not hide a column ($s)"
echo "$s" | rg -q '"menuOpen":true'  && ok "menu stays open after toggling" || bad "menu closed on toggle ($s)"
echo "$s" | rg -q '"unchecked":1'    && ok "row indicator now unchecked" || bad "row indicator did not update ($s)"
echo "$s" | rg -q '"badge":"11/12"'  && ok "button badge shows 11/12" || bad "badge missing/wrong ($s)"
agent-browser screenshot "$SHOTS/columns-menu-one-hidden.png" > /dev/null 2>&1 || true

click_col_row 5
s=$(table_state); echo "after restore: $s"
echo "$s" | rg -q '"headerCount":14' && ok "clicking again restores the column (13 → 14)" || bad "second click did not restore ($s)"
echo "$s" | rg -q '"unchecked":0'    && ok "row indicator back to checked" || bad "indicator stuck unchecked ($s)"

# Show all item is the last menuitem
pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role^=\"menuitem\"]')); return it[it.length - 1] || null; })()"
sleep 1
s=$(table_state); echo "after show-all: $s"
echo "$s" | rg -q '"menuOpen":false' && ok "'Show all' closes the menu" || bad "menu did not close after Show all ($s)"
echo "$s" | rg -q '"headerCount":14' && ok "'Show all' leaves every column visible" || bad "Show all broke visibility ($s)"

# hide two more (menu stays open between toggles), then reload page → persistence
open_columns
click_col_row 2
click_col_row 3
s=$(table_state); echo "two hidden: $s"
echo "$s" | rg -q '"headerCount":12' && ok "two columns hidden (14 → 12)" || bad "double hide failed ($s)"
agent-browser open "$BASE/"; agent-browser wait --load networkidle; sleep 3
goto_records "Industry"
s=$(table_state); echo "after reload: $s"
echo "$s" | rg -q '"headerCount":12' && ok "hidden set persists across reload (localStorage)" || bad "persistence failed ($s)"
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Columns'))"; sleep 1
pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role^=\"menuitem\"]')); return it[it.length - 1] || null; })()"
sleep 1

# ---------- Health (shared component sanity) ------------------------------------
goto_records "Health"
s=$(table_state); echo "health initial: $s"
hdr=$(echo "$s" | rg -o '"headerCount":[0-9]+' | rg -o '[0-9]+')
[ -n "$hdr" ] && ok "Health table renders ($hdr headers)" || bad "Health table state unreadable ($s)"
open_columns
click_col_row 1
s=$(table_state); echo "health after hide: $s"
want=$((hdr - 1))
echo "$s" | rg -q "\"headerCount\":$want" && ok "Health: row click hides a column ($hdr → $want)" || bad "Health row click did not hide ($s)"
# menu is still open after the toggle — click "Show all" directly
pointer_seq "(() => { const m = document.querySelector('[role=\"menu\"]'); if (!m) return null; const it = Array.from(m.querySelectorAll('[role^=\"menuitem\"]')); return it[it.length - 1] || null; })()"
sleep 1
s=$(table_state)
echo "$s" | rg -q "\"headerCount\":$hdr" && ok "Health: Show all restores everything" || bad "Health Show all failed ($s)"

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
