#!/bin/bash
cd /home/z/my-project/guesthousedatacollectionapp
pkill -9 -f "next dev" 2>/dev/null || true; sleep 1
npm run dev > /tmp/dev.log 2>&1 &
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break; sleep 1
done
echo "SERVER READY"
AB="agent-browser"
$AB close 2>/dev/null || true
$AB open http://localhost:3000 --timeout 30000
sleep 4
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
echo "== ALL HEADER BUTTONS =="
$AB eval "Array.from(document.querySelectorAll('main button')).map(b=>JSON.stringify(b.textContent.trim())).join(' | ')"
echo "== BODY HAS MANAGE? =="
$AB eval "document.body.textContent.includes('Manage')"
echo "== CLICK MANAGE =="
$AB eval "(()=>{const b=Array.from(document.querySelectorAll('main button')).find(x=>x.textContent.trim()==='Manage');if(!b)return 'BTN NOT FOUND';b.click();return 'CLICKED '+b.tagName;})()"
sleep 1
echo "== MENUITEMS =="
$AB eval "Array.from(document.querySelectorAll('[role=menuitem]')).map(m=>m.textContent).join(' | ')"
echo "== CLICK SETTINGS ITEM =="
$AB eval "(()=>{const m=Array.from(document.querySelectorAll('[role=menuitem]')).find(x=>x.textContent.includes('Settings'));if(!m)return 'ITEM NOT FOUND';m.click();return 'CLICKED';})()"
sleep 3
echo "== TAB STATE =="
$AB eval "document.body.textContent.includes('Sub-Cities & Woredas') ? 'SETTINGS OPEN' : 'NOT OPEN'"
$AB eval "Array.from(document.querySelectorAll('[role=tab]')).map(t=>t.textContent).join(' | ')"
$AB screenshot /tmp/debug-state.png
$AB close
pkill -9 -f "next dev" 2>/dev/null || true
echo DEBUG DONE
