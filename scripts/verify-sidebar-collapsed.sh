#!/bin/bash
# Verify: sidebar starts folded at load (only active group open), unfolds on demand
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-folded.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev-folded.log; kill $DEV_PID 2>/dev/null; exit 1; }

AB="agent-browser"
E() { $AB eval "$1"; }

$AB close 2>/dev/null || true
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 5
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 6

echo "== open groups at load (expect only industry) =="
E "(() => { const items = Array.from(document.querySelectorAll('aside [data-slot=accordion-item]')); const open = items.filter(i => i.querySelector('[data-slot=accordion-trigger]')?.getAttribute('data-state') === 'open').map(i => i.querySelector('[data-slot=accordion-trigger]').textContent.trim()); return JSON.stringify(open); })()"

echo "== click Small Enterprise trigger to unfold =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Small Enterprise')); if(!t) return 'MISSING'; t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const triggers = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')); const t = triggers.find(x => x.textContent.includes('Small Enterprise')); const item = t.closest('[data-slot=accordion-item]'); const labels = Array.from(item.querySelectorAll('[data-slot=accordion-content] button')).map(b => b.textContent.trim()); const state = t.getAttribute('data-state'); return JSON.stringify({state, labels}); })()"
$AB screenshot /tmp/sidebar-folded.png

echo "== navigate to Goals tab =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const g = btns.find(b => b.textContent.trim() === 'Goals'); if(!g) return 'GOALS BTN MISSING'; g.click(); return 'GOALS CLICKED'; })()"
sleep 3
E "(() => { const body = document.body.innerText; return body.includes('Goals & Targets') ? 'GOALS PANEL OK' : 'GOALS PANEL MISSING'; })()"

echo "== reload page: groups should fold again (only active group open) =="
$AB open http://localhost:3000 --timeout 30000
sleep 6
E "(() => { const items = Array.from(document.querySelectorAll('aside [data-slot=accordion-item]')); const open = items.filter(i => i.querySelector('[data-slot=accordion-trigger]')?.getAttribute('data-state') === 'open').map(i => i.querySelector('[data-slot=accordion-trigger]').textContent.trim()); return 'OPEN AFTER RELOAD: ' + JSON.stringify(open); })()"

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
