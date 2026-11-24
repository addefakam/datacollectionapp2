#!/bin/bash
# Full browser UI smoke test — semantic locators for Radix widgets
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
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

echo "== LOGIN =="
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
E "document.querySelector('header h1')?.textContent"
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== MANAGE → SETTINGS =="
$AB find text "Manage" click
sleep 1
$AB find role menuitem click --name "Settings (Locations & Categories)"
sleep 3
E "document.body.textContent.includes('Sub-Cities & Woredas') ? 'SETTINGS TAB OPEN' : 'NOT OPEN'"

echo "== LOCATIONS: SEEDED LIST CHECK =="
for name in Dukam Chelaleka Debaayyuu; do
  E "document.body.textContent.includes('$name') ? '$name OK' : '$name MISSING'"
done

echo "== ADD SUB-CITY VIA UI =="
$AB find first "input[placeholder*='New sub-city']" fill "Browser Test SC"
$AB find first "input[placeholder*='Woredas']" fill "BT Woreda 1, BT Woreda 2"
$AB find role button click --name "Add Sub-City"
sleep 3
E "document.body.textContent.includes('Browser Test SC') && document.body.textContent.includes('BT Woreda 1') ? 'SUB-CITY ADDED AND VISIBLE' : 'SUB-CITY MISSING'"

echo "== SCREENSHOT LOCATIONS =="
$AB screenshot /tmp/settings-locations.png

echo "== SWITCH TO CATEGORIES TAB =="
$AB find role tab click --name "Categories"
sleep 2
E "document.body.textContent.includes('Industry Categories') ? 'CATEGORIES TAB OPEN' : 'NOT OPEN'"
E "document.body.textContent.includes('Food & Beverage Processing') ? 'SEEDED CATEGORIES OK' : 'SEEDED CATEGORIES MISSING'"

echo "== ADD CATEGORY VIA UI =="
$AB find first "input[placeholder*='New category']" fill "Browser Test Cat"
$AB find role button click --name "Add"
sleep 3
E "document.body.textContent.includes('Browser Test Cat') ? 'CATEGORY ADDED AND VISIBLE' : 'CATEGORY MISSING'"

echo "== SCREENSHOT CATEGORIES =="
$AB screenshot /tmp/settings-categories.png

echo "== DELETE CATEGORY VIA UI =="
CNT=$($AB get count "button[title='Delete']")
echo "delete buttons: $CNT"
$AB find nth $((CNT-1)) "button[title='Delete']" click
sleep 1
$AB find role button click --name "Delete"
sleep 3
E "document.body.textContent.includes('Browser Test Cat') ? 'CATEGORY STILL THERE' : 'CATEGORY DELETED'"

echo "== DELETE SUB-CITY VIA UI =="
$AB find role tab click --name "Locations"
sleep 2
CNT2=$($AB get count "button[title='Delete']")
echo "delete buttons: $CNT2"
$AB find nth $((CNT2-1)) "button[title='Delete']" click
sleep 1
$AB find role button click --name "Delete"
sleep 3
E "document.body.textContent.includes('Browser Test SC') ? 'SUB-CITY STILL THERE' : 'SUB-CITY DELETED'"

echo "== CLEAN CHECK =="
E "document.body.textContent.includes('Browser Test') ? 'RESIDUE FOUND' : 'ALL UI TEST DATA CLEANED'"

$AB close
kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
echo "== UI TEST COMPLETE =="
