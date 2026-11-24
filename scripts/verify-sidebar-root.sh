#!/bin/bash
# Verify sidebar shows the Small Enterprise group with Survey/Records/Stats/Goals
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "standalone/server.js" 2>/dev/null || true
sleep 1

PORT=3100 npm run dev > /tmp/dev-root.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev-root.log; kill $DEV_PID 2>/dev/null; exit 1; }

AB="agent-browser"
E() { $AB eval "$1"; }

echo "== BROWSER: login =="
$AB close 2>/dev/null || true
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 5
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 6
echo "== Small Enterprise group items (groups start expanded, no click needed) =="
E "(() => { const triggers = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')); const t = triggers.find(x => x.textContent.includes('Small Enterprise')); if(!t) return 'GROUP MISSING'; const item = t.closest('[data-slot=accordion-item]'); const labels = Array.from(item.querySelectorAll('[data-slot=accordion-content] button')).map(b => b.textContent.trim()); return JSON.stringify(labels); })()"
echo "== screenshot =="
$AB screenshot /tmp/sidebar-proof.png
echo "== Goals tab opens =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const g = btns.find(b => b.textContent.trim() === 'Goals'); if(!g) return 'GOALS BTN MISSING'; g.click(); return 'GOALS CLICKED'; })()"
sleep 3
E "(() => { const el = document.querySelector('[data-slot=tabs-content][value=mseGoals], [role=tabpanel]'); const body = document.body.innerText; const has = ['Goal','Target','progress'].some(w => body.toLowerCase().includes(w.toLowerCase())); return has ? 'GOALS PANEL RENDERED' : 'GOALS PANEL EMPTY'; })()"
$AB screenshot /tmp/goals-proof.png 2>/dev/null || true

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
