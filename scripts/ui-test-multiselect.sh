#!/bin/bash
# Browser UI test: Education survey — multi-select Institution Type combobox
# Single invocation (background servers get killed between tool calls).
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
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== OPEN Education ▾ → Education Survey =="
$AB find text "Education" click
sleep 1
$AB find role menuitem click --name "Education Survey"
sleep 3
E "document.body.textContent.includes('Odeeffannoo Mana Barumsaa') ? 'SURVEY STEP 1 OPEN' : 'SURVEY NOT OPEN'"

echo "== FILL NAME, THEN MULTI-SELECT INSTITUTION TYPE =="
$AB find first "#e-institutionName" fill "ZZTEST Browser Multi Academy"
echo "-- trigger label before selection:"
E "document.querySelector('#e-institutionType')?.textContent?.trim()"
$AB find first "#e-institutionType" click
sleep 1
E "document.querySelector('[cmdk-input]') ? 'POPOVER OPEN' : 'POPOVER NOT OPEN'"
# Pick two types via cmdk items
$AB find role option click --name "Kindergarten"
sleep 0.5
$AB find role option click --name "Primary School (1-4)"
sleep 0.5
echo "-- selected chips rendered:"
E "Array.from(document.querySelectorAll('span')).filter(s=>s.textContent==='Kindergarten').length > 0 ? 'CHIP Kindergarten OK' : 'NO CHIP'"
echo "-- trigger label after 2 selections:"
E "document.querySelector('#e-institutionType')?.textContent?.trim()"
# Popover stays open in cmdk multi-select; close it by pressing Escape
$AB key Escape
sleep 0.5

echo "== REST OF STEP 1 (seeded sub-cities: Dukam/Chelaleka/Debaayyuu) =="
$AB find first "#e-subCity" click
sleep 1
$AB find role option click --name "Dukam"
sleep 1
$AB find first "#e-area" click
sleep 1
E "Array.from(document.querySelectorAll('[role=option]')).slice(0,3).map(o=>o.textContent).join('|')"
FIRST_AREA=$(E "Array.from(document.querySelectorAll('[role=option]'))[0]?.textContent" | tr -d '"')
$AB find role option click --name "$FIRST_AREA"
sleep 0.5
$AB find first "#e-specificAddress" fill "Near Browser Test Landmark"

echo "== NEXT STEP: multi-select passes step-1 validation =="
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
E "document.body.textContent.includes('Ownership Type') || document.body.textContent.includes('Gosa Abbaa Qabuu') ? 'STEP 2 REACHED — MULTI-SELECT VALIDATION PASSED' : 'STILL STEP 1 — VALIDATION FAILED?'"

echo "== SCREENSHOT =="
$AB screenshot /tmp/multiselect-step2.png 2>/dev/null && echo "screenshot saved"

$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "UI TEST DONE — server stopped"
