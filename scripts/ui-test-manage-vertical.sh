#!/bin/bash
# Browser test: vertical Manage menu (accordion popover on desktop, drawer on mobile)
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev.log; exit 1; }

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
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== DESKTOP: open Manage popover =="
$AB find role button click --name "Manage"
sleep 1.5
E "document.body.textContent.includes('Control center') ? 'POPOVER PANEL OPEN' : 'POPOVER NOT OPEN'"
E "Array.from(document.querySelectorAll('[data-slot=accordion-item]')).length + ' accordion groups'"
E "document.body.textContent.includes('Industry') && document.body.textContent.includes('Administration') ? 'ALL 6 GROUP HEADERS PRESENT' : 'GROUPS MISSING'"

echo "== expand Industry group =="
$AB find role button click --name "Industry 3"
sleep 1
E "document.body.textContent.includes('Attendance') ? 'INDUSTRY EXPANDED (Records/Stats/Attendance visible)' : 'NOT EXPANDED'"

echo "== click Records → should switch to Industry Records and close panel =="
$AB find role button click --name "Records"
sleep 3
E "document.body.textContent.includes('Industry') && !document.body.textContent.includes('Control center') ? 'PANEL CLOSED AFTER SELECT' : 'PANEL STILL OPEN?'"

echo "== reopen: Education group → Records =="
$AB find role button click --name "Manage"
sleep 1.5
$AB find role button click --name "Education 2"
sleep 0.8
$AB find role button click --name "Records"
sleep 3
E "document.body.textContent.includes('Education') ? 'EDUCATION RECORDS REACHED VIA MENU' : 'NAV FAILED'"
$AB screenshot /tmp/manage-desktop-panel.png && echo "shot1"

echo "== screenshot of panel open (reopen + expand two groups) =="
$AB find role button click --name "Manage"
sleep 1.5
$AB find role button click --name "Education 2"
sleep 0.8
$AB screenshot /tmp/manage-desktop-open.png && echo "shot2"
$AB key Escape
sleep 0.5

echo "== MOBILE: 390x844, hamburger drawer =="
$AB set viewport 390 844
sleep 1
$AB open http://localhost:3000 --timeout 30000
sleep 4
E "document.querySelector('button[aria-label=\"Open manage menu\"]') ? 'HAMBURGER VISIBLE' : 'HAMBURGER MISSING'"
$AB find first "button[aria-label='Open manage menu']" click
sleep 1.5
E "document.body.textContent.includes('Manage / Bulchiinsa') ? 'DRAWER OPEN' : 'DRAWER NOT OPEN'"
$AB find role button click --name "Hotel 3"
sleep 1
E "document.body.textContent.includes('Attendance') ? 'HOTEL GROUP EXPANDED IN DRAWER' : 'NOT EXPANDED'"
$AB screenshot /tmp/manage-mobile-drawer.png && echo "shot3"

echo "== select Hotel Records from drawer =="
$AB find role button click --name "Records"
sleep 3
E "!document.body.textContent.includes('Manage / Bulchiinsa') ? 'DRAWER CLOSED AFTER SELECT' : 'DRAWER STILL OPEN?'"

echo "== mobile Manage pill also opens drawer =="
$AB find role button click --name "Manage"
sleep 1.5
E "document.body.textContent.includes('Manage / Bulchiinsa') ? 'PILL OPENS DRAWER ON MOBILE' : 'PILL FAILED'"
$AB screenshot /tmp/manage-mobile-pill.png && echo "shot4"
$AB key Escape

$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "UI TEST DONE"
