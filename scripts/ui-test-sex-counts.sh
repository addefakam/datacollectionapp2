#!/bin/bash
# Browser UI test: sex breakdown (male/female) in the Industry survey flow
# - auto-fill of total from male+female
# - review step shows the breakdown
# - records list shows "M 12 · F 13"
# - stats KPI shows M/F totals
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
CHK() { R=$(E "$1"); echo "  ${R}: $2"; }

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

echo "== OPEN Industry ▾ → Industry Survey =="
$AB find text "Industry" click
sleep 1
$AB find role menuitem click --name "Industry Survey"
sleep 3
CHK "document.body.textContent.includes('Odeeffannoo Indastrii') ? 'STEP1 OPEN' : 'STEP1 MISSING'" "survey step 1"

echo "== STEP 1 FILL =="
$AB find first "#establishmentName" fill "ZZTEST Browser Sex Factory"
$AB find first "#sector" click
sleep 1
$AB find role option click --name "Wood & Furniture"
sleep 1
$AB find first "#subCity" click
sleep 1
$AB find role option click --name "Dukam"
sleep 1
$AB find first "#area" click
sleep 1
FIRST_AREA=$(E "document.querySelector('[role=listbox] [role=option]')?.textContent?.trim()" | tr -d '"')
echo "  first area option: $FIRST_AREA"
$AB find role option click --name "$FIRST_AREA"
sleep 0.5
$AB find first "#specificAddress" fill "Browser Test Street 1"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
CHK "document.body.textContent.includes('Galmee fi Safiisaa') ? 'STEP2 OPEN' : 'STEP2 MISSING'" "survey step 2"

echo "== STEP 2: SEX AUTO-FILL (male=12, female=13, total empty → 25) =="
$AB find first "#ownership-Private Limited Company" click 2>/dev/null || $AB find text "Private Limited Company" click
sleep 0.5
$AB find first "#maleEmployees" fill "12"
$AB find first "#femaleEmployees" fill "13"
sleep 0.5
CHK "document.querySelector('#employeeCount')?.value === '25' ? 'AUTOFILL OK' : 'VALUE='+document.querySelector('#employeeCount')?.value" "total auto-filled from male+female"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5

echo "== STEP 3: CONTACT =="
$AB find first "#contactName" fill "Browser Tester"
$AB find first "#contactPhone" fill "+251911223344"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
CHK "document.body.textContent.includes('Male Employees') && document.body.textContent.includes('Female Employees') ? 'REVIEW SEX ROWS OK' : 'REVIEW SEX ROWS MISSING'" "review shows male/female rows"

echo "== STEP 4: CONFIRM + SUBMIT =="
$AB find first "#confirm-yes" click
sleep 0.5
$AB find role button click --name "Submit Survey / Galchi"
sleep 3
CHK "document.body.textContent.includes('recorded successfully') ? 'SUBMITTED' : 'SUBMIT FAILED'" "survey submitted"

echo "== RECORDS: M/F chips visible =="
$AB find text "Industry" click
sleep 1
$AB find role menuitem click --name "Industry Records"
sleep 3
CHK "document.body.textContent.includes('M 12') && document.body.textContent.includes('F 13') ? 'M/F CHIPS OK' : 'CHIPS MISSING'" "record shows M 12 · F 13"

echo "== STATS: KPI shows M/F totals =="
$AB find text "Industry" click
sleep 1
$AB find role menuitem click --name "Industry Stats"
sleep 3
CHK "document.body.textContent.includes('M 25') && document.body.textContent.includes('F 13') ? 'KPI M/F OK' : 'KPI MISSING'" "stats KPI shows M 25 / F 13"

$AB screenshot /tmp/sex-records.png
echo "== DONE =="
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
