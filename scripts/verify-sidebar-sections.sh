#!/bin/bash
# Verify: sidebar sections (Data Collection / Initiatives) + folded-at-load still works
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-sections.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev-sections.log; kill $DEV_PID 2>/dev/null; exit 1; }

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

echo "== section labels present? =="
E "(() => { const nav = document.querySelector('aside nav'); const txt = nav.innerText; const hasData = txt.toUpperCase().includes('DATA COLLECTION'); const hasInit = txt.toUpperCase().includes('INITIATIVES'); const initBeforeSME = txt.toUpperCase().indexOf('INITIATIVES') < txt.toUpperCase().indexOf('SMALL ENTERPRISE'); return JSON.stringify({hasData, hasInit, initBeforeSME}); })()"

echo "== folded at load (expect only Industry open) =="
E "(() => { const items = Array.from(document.querySelectorAll('aside [data-slot=accordion-item]')); const open = items.filter(i => i.querySelector('[data-slot=accordion-trigger]')?.getAttribute('data-state') === 'open').map(i => i.querySelector('[data-slot=accordion-trigger]').textContent.trim()); return JSON.stringify(open); })()"

echo "== unfold Small Enterprise under Initiatives =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Small Enterprise')); if(!t) return 'MISSING'; t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const triggers = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')); const t = triggers.find(x => x.textContent.includes('Small Enterprise')); const item = t.closest('[data-slot=accordion-item]'); const labels = Array.from(item.querySelectorAll('[data-slot=accordion-content] button')).map(b => b.textContent.trim()); return JSON.stringify(labels); })()"
$AB screenshot /tmp/sidebar-sections.png

echo "== Goals tab still works =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const g = btns.find(b => b.textContent.trim() === 'Goals'); if(!g) return 'MISSING'; g.click(); return 'CLICKED'; })()"
sleep 3
E "(() => { return document.body.innerText.includes('Goals & Targets') ? 'GOALS PANEL OK' : 'GOALS PANEL MISSING'; })()"

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
