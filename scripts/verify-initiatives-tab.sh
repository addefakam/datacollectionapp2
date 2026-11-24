#!/bin/bash
# Verify: Initiatives as expandable tab → lists initiatives (Small Enterprise) → pages
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-init-tab.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -25 /tmp/dev-init-tab.log; kill $DEV_PID 2>/dev/null; exit 1; }

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

echo "== at load: Initiatives tab folded? =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().startsWith('Initiatives')); return t ? 'state=' + t.getAttribute('data-state') : 'INITIATIVES TRIGGER MISSING'; })()"

echo "== click Initiatives tab → list of initiatives =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().startsWith('Initiatives')); t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().startsWith('Initiatives')); const item = t.closest('[data-slot=accordion-item]'); const inner = item.querySelector('[data-slot=accordion-content] [data-slot=accordion]'); const initiatives = inner ? Array.from(inner.querySelectorAll(':scope > [data-slot=accordion-item] > [data-slot=accordion-trigger]')).map(b => b.textContent.trim()) : []; return JSON.stringify(initiatives); })()"

echo "== expand Small Enterprise inside Initiatives =="
E "(() => { const all = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).filter(x => x.textContent.includes('Small Enterprise')); const inner = all.find(x => x.closest('[data-slot=accordion-item][value=initiatives], [data-slot=accordion-item]')?.parentElement?.closest('[data-slot=accordion-content]')); const t = inner || all[0]; t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const all = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).filter(x => x.textContent.includes('Small Enterprise')); const t = all[all.length - 1]; const item = t.closest('[data-slot=accordion-item]'); const labels = Array.from(item.querySelectorAll('[data-slot=accordion-content] button')).map(b => b.textContent.trim()); const state = t.getAttribute('data-state'); return JSON.stringify({state, labels}); })()"
$AB screenshot /tmp/initiatives-tab.png

echo "== navigate to Goals (both levels auto-open) =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const g = btns.find(b => b.textContent.trim() === 'Goals'); if(!g) return 'MISSING'; g.click(); return 'CLICKED'; })()"
sleep 3
E "(() => { const it = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().startsWith('Initiatives')); const sme = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).filter(x => x.textContent.includes('Small Enterprise')).pop(); const panel = document.body.innerText.includes('Goals & Targets'); return JSON.stringify({initiativesState: it?.getAttribute('data-state'), smeState: sme?.getAttribute('data-state'), goalsPanel: panel}); })()"

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
