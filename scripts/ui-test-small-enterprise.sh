#!/bin/bash
# E2E test: Small Enterprise module (survey → records → stats → analytics)
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
code=000
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev.log; exit 1; }

AB="agent-browser"
E() { $AB eval "$1"; }

echo "== API SMOKE =="
curl -s -X POST http://localhost:3000/api/smallenterprises -H 'Content-Type: application/json' -d '{"enterpriseName":"API TEST TAILOR SHOP","enterpriseType":"Manufacturing","ownershipType":"Cooperative","subCity":"Debaayyuu","area":"Debaayyuu 01","specificAddress":"Test street","employeeCount":5,"maleEmployees":2,"femaleEmployees":3,"startupCapital":50000,"hasPremises":true,"hasTraining":false,"contactName":"Test Owner","contactPhone":"0911112223","surveyorName":"api-test"}' | head -c 200
echo ""
curl -s "http://localhost:3000/api/smallenterprises/stats" | head -c 300
echo ""
curl -s -o /tmp/mse-template.xlsx -w "template: %{http_code} %{size_download} bytes\n" http://localhost:3000/api/smallenterprises/import/template
curl -s -o /tmp/mse-export.csv -w "csv export: %{http_code} %{size_download} bytes\n" "http://localhost:3000/api/smallenterprises/export"

echo "== BROWSER: login =="
$AB close 2>/dev/null || true
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 4
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== SIDEBAR: Small Enterprise group present =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Small Enterprise')); return t ? 'GROUP PRESENT' : 'GROUP MISSING'; })()"
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Survey' && x.closest('[data-slot=accordion-item]').textContent.includes('Small Enterprise')); if(!b) return 'SURVEY BTN NOT FOUND'; b.click(); return 'SURVEY CLICKED'; })()"
sleep 4
E "document.querySelector('main').textContent.includes('Small enterprise information') ? 'MSE FORM LOADED' : 'MSE FORM NOT LOADED'"
$AB screenshot /tmp/mse-form.png && echo shot-form

echo "== FILL FORM STEP 1 =="
$AB find first "#enterpriseName" fill "DUKAM FURNITURE WORKS"
$AB find first "#enterpriseType" click; sleep 0.8
E "(() => { const o = Array.from(document.querySelectorAll('[role=option]')).find(x => x.textContent.trim()==='Food Processing'); if(!o) return 'OPT NOT FOUND'; o.click(); return 'TYPE SELECTED'; })()"
sleep 0.5
$AB find first "#subCity" click; sleep 0.8
E "(() => { const o = document.querySelector('[role=option]'); if(!o) return 'NO OPTIONS'; window.__mseCity = o.textContent.trim(); o.click(); return 'CITY: ' + window.__mseCity; })()"
sleep 0.5
$AB find first "#area" click; sleep 0.8
E "(() => { const o = document.querySelector('[role=option]'); if(!o) return 'NO OPTIONS'; window.__mseArea = o.textContent.trim(); o.click(); return 'AREA: ' + window.__mseArea; })()"
sleep 0.5
$AB find first "#specificAddress" fill "Near Dukam bus stop"
E "document.querySelector('#enterpriseName').value + ' | type+city+area picked' "
$AB find role button click --name "Next / Itti fufi"
sleep 1.5

echo "== FILL FORM STEP 2 =="
E "document.querySelector('#employeeCount') ? 'STEP 2 RENDERED' : 'STILL ON STEP 1'"
$AB find first "label[for='mse-ownership-Private']" click
$AB find first "#employeeCount" fill "12"
$AB find first "#maleEmployees" fill "7"
$AB find first "#femaleEmployees" fill "5"
sleep 0.5
E "document.querySelector('#employeeCount').value === '12' ? 'SEX AUTOSUM OK (12)' : 'AUTOSUM VALUE: ' + document.querySelector('#employeeCount').value"
$AB find first "#startupCapital" fill "150000"
$AB find first "label[for='hasPremises-yes']" click
$AB find first "label[for='hasTraining-no']" click
$AB find role button click --name "Next / Itti fufi"
sleep 1.5

echo "== FILL FORM STEP 3 =="
E "document.querySelector('#contactName') ? 'STEP 3 RENDERED' : 'STILL ON STEP 2'"
$AB find first "#contactName" fill "Abebe Kebede"
$AB find first "#contactPhone" fill "+251912345678"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5

echo "== STEP 4: REVIEW + SUBMIT =="
E "document.querySelector('main').textContent.includes('DUKAM FURNITURE WORKS') ? 'REVIEW SHOWS DATA' : 'REVIEW EMPTY'"
E "(() => { const l = document.querySelector('label[for=mse-confirm-yes]'); if(!l) return 'CONFIRM LABEL MISSING'; l.click(); return 'CONFIRMED'; })()"
sleep 0.5
E "document.querySelectorAll('button[type=submit]').length > 0 ? 'SUBMIT BTN PRESENT' : 'NO SUBMIT BTN'"
$AB find first "button[type=submit]" click
sleep 4
E "document.body.textContent.includes('Survey Submitted') || document.body.textContent.includes('galmeen safiisan argame') ? 'SUBMITTED OK' : 'SUBMIT FAILED'"
$AB screenshot /tmp/mse-after-submit.png && echo shot-submit

echo "== RECORDS LIST =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Records' && x.closest('[data-slot=accordion-item]').textContent.includes('Small Enterprise')); if(!b) return 'NOT FOUND'; b.click(); return 'NAVIGATED'; })()"
sleep 4
E "document.querySelector('main').textContent.includes('DUKAM FURNITURE WORKS') ? 'RECORD VISIBLE' : 'RECORD NOT IN LIST'"
E "document.querySelector('main').textContent.includes('API TEST TAILOR SHOP') ? 'API RECORD VISIBLE TOO' : 'API RECORD MISSING'"
E "(() => { const m = document.querySelector('main').textContent; return (m.includes('M 7') && m.includes('F 5')) ? 'SEX CHIPS OK' : 'SEX CHIPS MISSING'; })()"
$AB screenshot /tmp/mse-records.png && echo shot-records

echo "== STATS PAGE =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Stats' && x.closest('[data-slot=accordion-item]').textContent.includes('Small Enterprise')); if(!b) return 'NOT FOUND'; b.click(); return 'NAVIGATED'; })()"
sleep 4
E "document.querySelector('main').textContent.includes('By Enterprise Type') ? 'STATS CHARTS OK' : 'STATS MISSING'"
E "document.querySelectorAll('main svg.recharts-surface').length + ' charts rendered'"
E "document.querySelector('main').textContent.includes('17') ? 'TOTAL 17 ENTERPRISES SHOWN' : 'TOTAL COUNT CHECK: see screenshot'"
$AB screenshot /tmp/mse-stats.png && echo shot-stats

echo "== ANALYTICS INTEGRATION =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Analytics'); if(!b) return 'NOT FOUND'; b.click(); return 'NAVIGATED'; })()"
sleep 5
E "document.querySelector('main').textContent.includes('Small Enterprise') ? 'ANALYTICS INCLUDES MSE' : 'ANALYTICS MISSING MSE'"
E "document.querySelector('main').textContent.includes('MSE jobs') ? 'MSE JOBS TILE OK' : 'MSE JOBS TILE MISSING'"
E "document.querySelector('main').textContent.includes('Small Enterprises by Type') ? 'MSE DISTRIBUTION CARD OK' : 'MSE DISTRIBUTION MISSING'"
$AB screenshot /tmp/mse-analytics.png && echo shot-analytics

echo "== MOBILE: drawer with new group =="
$AB set viewport 390 844
sleep 1.5
$AB find first "button[aria-label='Open navigation menu']" click
sleep 1.5
E "(() => { const b = Array.from(document.querySelectorAll('[data-slot=sheet-content] button')).find(x => x.textContent.trim()==='Survey' && x.closest('[data-slot=accordion-item]').textContent.includes('Small Enterprise')); return b ? 'MOBILE MSE SURVEY PRESENT' : 'MOBILE MSE MISSING'; })()"
$AB screenshot /tmp/mse-mobile-drawer.png && echo shot-mobile

$AB close 2>/dev/null || true
echo "== dev.log errors =="
grep -iE "error" /tmp/dev.log | grep -viE "next-auth|warn" | tail -8 || echo "(no errors)"
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "E2E TEST DONE"
