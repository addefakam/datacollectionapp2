#!/bin/bash
# Browser test: Manage dropdown as central module management hub
cd /home/z/my-project/guesthousedatacollectionapp
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break; sleep 1
done
[ "$code" = "200" ] && echo "SERVER READY" || { echo "SERVER FAILED"; tail -20 /tmp/dev.log; exit 1; }

AB="agent-browser"
E() { $AB eval "$1"; }
$AB close 2>/dev/null || true
$AB set viewport 1280 900
$AB open http://localhost:3000 --timeout 30000
sleep 4
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
$AB find text "Not now" click 2>/dev/null || true

echo "== OPEN MANAGE DROPDOWN =="
$AB find text "Manage" click
sleep 1
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')].map(m=>m.textContent.trim());const labels=[...document.querySelectorAll('[role=menu] [data-orientation], [role=menuitem]')].length;return items.length+' items: '+items.slice(0,20).join(' | ');})()"
$AB screenshot /tmp/manage-dropdown.png

echo "== CLICK Education > Records =="
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')];const eduLabel=items.findIndex(m=>m.textContent.includes('Meetings'));return 'sanity '+eduLabel;})()"
# Radix menu items are indexed; click the Records item under Education section via eval — items are in DOM order
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')].map(m=>m.textContent.trim());const i=items.indexOf('Records', items.indexOf('Records')+1);const el=[...document.querySelectorAll('[role=menuitem]')][i];el.click();return 'clicked item #'+i+' -> '+items[i];})()"
sleep 3
E "document.body.textContent.includes('Education Records') ? 'EDU RECORDS OPENED FROM MANAGE' : 'NOT OPENED: '+document.body.textContent.slice(0,80)"

echo "== REOPEN MANAGE -> Agriculture > Stats =="
$AB find text "Manage" click
sleep 1
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')];const texts=items.map(m=>m.textContent.trim());const agriStatsIdx=texts.lastIndexOf('Stats');items[agriStatsIdx].click();return 'clicked agri Stats #'+agriStatsIdx;})()"
sleep 3
E "document.body.textContent.includes('Establishment Distribution') || document.body.textContent.includes('Agriculture Stats') || document.body.textContent.includes('Establishments') ? 'AGRI STATS OPENED FROM MANAGE' : 'NOT OPENED'"

echo "== REOPEN MANAGE -> Industry > Attendance =="
$AB find text "Manage" click
sleep 1
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')];const texts=items.map(m=>m.textContent.trim());const i=texts.indexOf('Attendance');items[i].click();return 'clicked Attendance #'+i;})()"
sleep 3
E "document.body.textContent.includes('Attendance') ? 'INDUSTRY ATTENDANCE OPENED' : 'NOT OPENED'"

echo "== REOPEN MANAGE -> Administration > Settings =="
$AB find text "Manage" click
sleep 1
E "(()=>{const items=[...document.querySelectorAll('[role=menuitem]')];const texts=items.map(m=>m.textContent.trim());const i=texts.findIndex(t=>t.includes('Settings'));items[i].click();return 'clicked Settings #'+i;})()"
sleep 3
E "document.body.textContent.includes('Sub-Cities & Woredas') ? 'SETTINGS OPENED FROM MANAGE' : 'NOT OPENED'"

echo "== MOBILE (375px) DROPDOWN =="
$AB set viewport 375 700
sleep 2
$AB find text "Manage" click
sleep 1
E "(()=>{const menu=document.querySelector('[role=menu]');if(!menu)return 'NO MENU';const r=menu.getBoundingClientRect();return 'menu '+Math.round(r.width)+'x'+Math.round(r.height)+' at bottom '+Math.round(r.bottom)+' (viewport 700) fits='+(r.bottom<=700);})()"
$AB screenshot /tmp/manage-mobile.png

$AB close
kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
echo "== MANAGE HUB TEST COMPLETE =="
