#!/bin/bash
# E2E verify: offline-queue sync fix
# Scenario 1 (user's bug): browser online, server unreachable at submit → survey queued
#   → when server returns, queue must flush AUTOMATICALLY (no page reload, no manual click)
# Scenario 2 (rescue): record already sitting in the IndexedDB queue must auto-sync via interval
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-sync-fix.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -25 /tmp/dev-sync-fix.log; kill $DEV_PID 2>/dev/null; exit 1; }

AB="agent-browser"
E() { $AB eval "$1"; }
dbcheck() {
  python3 -c "
import sqlite3
con = sqlite3.connect('db/custom.db')
print('  DB BERHANU GROCERY STORE:', con.execute(\"SELECT COUNT(*) FROM SmallEnterprise WHERE enterpriseName='BERHANU GROCERY STORE'\").fetchone()[0])
print('  DB QUEUE RESCUE SHOP:', con.execute(\"SELECT COUNT(*) FROM SmallEnterprise WHERE enterpriseName='QUEUE RESCUE SHOP'\").fetchone()[0])
con.close()"
}
qcount() {
  E "(() => { window.__qc = '?'; const r = indexedDB.open('bgh-survey-offline', 1); r.onsuccess = () => { const tx = r.result.transaction('pending_surveys','readonly'); const rq = tx.objectStore('pending_surveys').count(); rq.onsuccess = () => { window.__qc = rq.result; }; }; return 'kicked'; })()"
  sleep 1.2
  E "String(window.__qc)"
}

echo "== API SMOKE: valid POST =="
curl -s -o /dev/null -w "  valid POST status: %{http_code}\n" -X POST http://localhost:3000/api/smallenterprises -H 'Content-Type: application/json' -d '{"enterpriseName":"API SMOKE RECORD","enterpriseType":"Manufacturing","ownershipType":"Cooperative","subCity":"Debaayyuu","area":"Debaayyuu 01","specificAddress":"smoke street","employeeCount":5,"maleEmployees":2,"femaleEmployees":3,"startupCapital":50000,"hasPremises":true,"hasTraining":false,"contactName":"Smoke Owner","contactPhone":"0911112223","surveyorName":"api-smoke"}'
echo "== API SMOKE: invalid POST (must be 400, never queued) =="
curl -s -o /dev/null -w "  missing-fields POST status: %{http_code}\n" -X POST http://localhost:3000/api/smallenterprises -H 'Content-Type: application/json' -d '{"enterpriseName":"BAD RECORD"}'

echo "== BROWSER: login + open SME survey =="
$AB close 2>/dev/null || true
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 5
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 6
$AB find text "Not now" click 2>/dev/null || echo "  (no PWA prompt)"
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().startsWith('Initiatives')); if(!t) return 'INITIATIVES MISSING'; if(t.getAttribute('data-state')!=='open') t.click(); return 'INITIATIVES OPEN'; })()"
sleep 1.5
E "(() => { const all = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).filter(x => x.textContent.includes('Small Enterprise')); const t = all[all.length - 1]; if(t.getAttribute('data-state')!=='open') t.click(); return 'SME OPEN'; })()"
sleep 1.5
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Survey' && x.closest('[data-slot=accordion-item]').textContent.includes('Small Enterprise')); if(!b) return 'SURVEY BTN MISSING'; b.click(); return 'SURVEY CLICKED'; })()"
sleep 4
E "document.querySelector('main').textContent.includes('Small enterprise information') ? 'MSE FORM LOADED' : 'MSE FORM NOT LOADED'"

echo "== KILL SERVER (browser stays online = the reported bug scenario) =="
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

echo "== FILL FORM (server down) =="
$AB find first "#enterpriseName" fill "BERHANU GROCERY STORE"
$AB find first "#enterpriseType" click; sleep 0.8
E "(() => { const o = Array.from(document.querySelectorAll('[role=option]')).find(x => x.textContent.trim()==='Food Processing'); if(!o) return 'OPT NOT FOUND'; o.click(); return 'TYPE SELECTED'; })()"
sleep 0.5
$AB find first "#subCity" click; sleep 0.8
E "(() => { const o = document.querySelector('[role=option]'); if(!o) return 'NO OPTIONS'; o.click(); return 'CITY PICKED'; })()"
sleep 0.5
$AB find first "#area" click; sleep 0.8
E "(() => { const o = document.querySelector('[role=option]'); if(!o) return 'NO OPTIONS'; o.click(); return 'AREA PICKED'; })()"
sleep 0.5
$AB find first "#specificAddress" fill "Near Berhanu market"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
E "document.querySelector('#employeeCount') ? 'STEP 2 RENDERED' : 'STILL ON STEP 1'"
$AB find first "label[for='mse-ownership-Private']" click
$AB find first "#employeeCount" fill "6"
$AB find first "#maleEmployees" fill "4"
$AB find first "#femaleEmployees" fill "2"
$AB find first "#startupCapital" fill "30000"
$AB find first "label[for='hasPremises-yes']" click
$AB find first "label[for='hasTraining-no']" click
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
E "document.querySelector('#contactName') ? 'STEP 3 RENDERED' : 'STILL ON STEP 2'"
$AB find first "#contactName" fill "Berhanu Tadesse"
$AB find first "#contactPhone" fill "+251934567890"
$AB find role button click --name "Next / Itti fufi"
sleep 1.5
E "(() => { const l = document.querySelector('label[for=mse-confirm-yes]'); if(!l) return 'CONFIRM LABEL MISSING'; l.click(); return 'CONFIRMED'; })()"
sleep 0.5
echo "== SUBMIT with server down → must queue, NOT lose data =="
$AB find first "button[type=submit]" click
sleep 4
E "document.body.textContent.includes('Saved Offline') ? 'QUEUED (Saved Offline toast)' : 'NO OFFLINE TOAST — check'"
echo "== pending badge while server down =="
E "(() => { const el = Array.from(document.querySelectorAll('aside button, aside div')).find(x => x.textContent.includes('pending')); return el ? 'BADGE: ' + el.textContent.trim() : 'BADGE MISSING'; })()"
$AB screenshot /tmp/sync-queued-badge.png && echo "  shot: /tmp/sync-queued-badge.png"
echo -n "  IndexedDB queue count: "; qcount
dbcheck

echo "== RESTART SERVER → queue must flush WITHOUT reload or clicks =="
npm run dev > /tmp/dev-sync-fix2.log 2>&1 &
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "  SERVER READY again" || { echo "  RESTART FAILED"; tail -25 /tmp/dev-sync-fix2.log; }
echo "== wait for natural 15s interval tick (no manual help) =="
sleep 22
dbcheck
echo -n "  IndexedDB queue count: "; qcount
E "(() => { const el = Array.from(document.querySelectorAll('aside button, aside div')).find(x => x.textContent.includes('pending')); return el ? 'BADGE STILL: ' + el.textContent.trim() : 'BADGE GONE (synced)'; })()"
$AB screenshot /tmp/sync-after-flush.png && echo "  shot: /tmp/sync-after-flush.png"

echo "== SCENARIO 2: pre-stuck record rescued by interval (user's existing queue) =="
E "(() => { window.__ins = 'pending'; const r = indexedDB.open('bgh-survey-offline', 1); r.onsuccess = () => { const tx = r.result.transaction('pending_surveys','readwrite'); const req = tx.objectStore('pending_surveys').add({ kind: 'small-enterprise', data: { enterpriseName: 'QUEUE RESCUE SHOP', enterpriseType: 'Retailing', ownershipType: 'Private', subCity: 'Debaayyuu', area: 'Debaayyuu 01', specificAddress: 'Rescue street', employeeCount: 4, maleEmployees: 2, femaleEmployees: 2, startupCapital: null, hasPremises: false, hasTraining: false, contactName: 'Rescue Owner', contactPhone: '0922334455', surveyorName: 'queue-rescue', surveyorId: '' }, createdAt: new Date().toISOString(), retryCount: 0 }); req.onsuccess = () => { window.__ins = 'ok id=' + req.result; }; req.onerror = () => { window.__ins = 'fail'; }; }; r.onerror = () => { window.__ins = 'openfail'; }; return 'insert kicked'; })()"
sleep 1.5
E "String(window.__ins)"
echo -n "  queue count after insert: "; qcount
echo "== wait one more interval tick =="
sleep 22
dbcheck
echo -n "  IndexedDB queue count: "; qcount

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo "SYNC FIX E2E DONE"
