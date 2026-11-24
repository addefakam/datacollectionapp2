#!/bin/bash
# Verify: Bussa Goonofa / Charity initiative — sidebar nesting, survey form, records, stats, goals
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-charity.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev-charity.log; kill $DEV_PID 2>/dev/null; exit 1; }

echo "== API smoke: POST /api/charities =="
curl -s -X POST http://localhost:3000/api/charities \
  -H 'Content-Type: application/json' \
  -d '{"organizationName":"HOPE ORPHAN SUPPORT CENTER","organizationType":"Local NGO","charityType":"Orphan & Vulnerable Children Support","subCity":"Bishoftu Central","area":"Bishoftu 01","specificAddress":"Near Central Market","registrationNumber":"REG-2024-045","beneficiaryCount":120,"maleBeneficiaries":55,"femaleBeneficiaries":65,"volunteerCount":18,"annualBudget":450000,"hasLegalRegistration":true,"contactName":"Abebe Tolera","contactPhone":"+251911234567","surveyorName":"admin","surveyorId":"admin"}' | head -c 400
echo ""
echo "== API smoke: GET /api/charities =="
curl -s "http://localhost:3000/api/charities?limit=5" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'total': d['total'], 'first': d['data'][0]['organizationName'] if d['data'] else None}))"

echo "== API smoke: GET /api/charities/stats =="
curl -s http://localhost:3000/api/charities/stats | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({k: d[k] for k in ['total','registered','totalBeneficiaries','totalVolunteers','totalBudget','organizationTypes']}))"

echo "== API smoke: GET /api/goals?module=bussa-goonofa =="
curl -s "http://localhost:3000/api/goals?module=bussa-goonofa" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'count': len(d.get('data', []))}))"

echo "== API smoke: POST goal with MSE metric under bussa-goonofa must FAIL =="
curl -s -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"module":"bussa-goonofa","metric":"enterprises","periodType":"monthly","targetValue":5}' | head -c 200
echo ""

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

echo "== expand Initiatives tab: both initiatives listed? =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.trim().toUpperCase().startsWith('INITIATIVES')); if(!t) return 'INITIATIVES TRIGGER MISSING'; t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const nav = document.querySelector('aside nav'); const txt = nav.innerText.toUpperCase(); return JSON.stringify({ hasSME: txt.includes('SMALL ENTERPRISE'), hasCharity: txt.includes('BUSSA GOONOFA') }); })()"
$AB screenshot /tmp/charity-1-initiatives.png

echo "== expand Bussa Goonofa / Charity -> page buttons =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Bussa Goonofa')); if(!t) return 'MISSING'; t.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const triggers = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')); const t = triggers.find(x => x.textContent.includes('Bussa Goonofa')); const item = t.closest('[data-slot=accordion-item]'); const labels = Array.from(item.querySelectorAll('[data-slot=accordion-content] button')).map(b => b.textContent.trim()); return JSON.stringify(labels); })()"

echo "== open charity Survey: wizard present? =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const b = btns.find(x => x.textContent.trim() === 'Survey' && x.closest('[data-slot=accordion-item]').textContent.includes('Bussa Goonofa')); if(!b) return 'MISSING'; b.click(); return 'CLICKED'; })()"
sleep 3
E "(() => { const txt = document.body.innerText; return JSON.stringify({ org: txt.includes('Charity organization information'), goonofa: txt.toUpperCase().includes('BUSSA GOONOFA'), steps: txt.includes('Step 1 of 4') }); })()"
$AB screenshot /tmp/charity-2-survey.png

echo "== open charity Records: seeded record listed? =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const b = btns.find(x => x.textContent.trim() === 'Records' && x.closest('[data-slot=accordion-item]').textContent.includes('Bussa Goonofa')); if(!b) return 'MISSING'; b.click(); return 'CLICKED'; })()"
sleep 4
E "(() => { const txt = document.body.innerText; return JSON.stringify({ title: txt.includes('Bussa Goonofa / Charity Records'), record: txt.includes('HOPE ORPHAN SUPPORT CENTER'), total: txt.match(/Bussa Goonofa \/ Charity Records\s*\n?\s*1/) !== null }); })()"
$AB screenshot /tmp/charity-3-records.png

echo "== open charity Stats =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const b = btns.find(x => x.textContent.trim() === 'Stats' && x.closest('[data-slot=accordion-item]').textContent.includes('Bussa Goonofa')); if(!b) return 'MISSING'; b.click(); return 'CLICKED'; })()"
sleep 5
E "(() => { const txt = document.body.innerText; return JSON.stringify({ kpi: txt.includes('Beneficiaries'), footer: txt.includes('Bussa Goonofa / Charity initiative'), noChart: txt.includes('No charity data yet') }); })()"
$AB screenshot /tmp/charity-4-stats.png

echo "== open charity Goals (metric picker must show charity metrics) =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const b = btns.find(x => x.textContent.trim() === 'Goals' && x.closest('[data-slot=accordion-item]').textContent.includes('Bussa Goonofa')); if(!b) return 'MISSING'; b.click(); return 'CLICKED'; })()"
sleep 4
E "(() => { const txt = document.body.innerText; return JSON.stringify({ hero: txt.includes('Bussa Goonofa (Charity) Initiative'), empty: txt.includes('No goals set yet'), charityEmptyText: txt.includes('Charity') && txt.includes('initiative') }); })()"
E "(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.trim() === 'New Goal'); if(!b) return 'MISSING'; b.click(); return 'CLICKED'; })()"
sleep 2
E "(() => { const dlg = document.querySelector('[role=dialog]'); if(!dlg) return 'NO DIALOG'; return JSON.stringify({ metricOptions: Array.from(dlg.querySelectorAll('[role=option]')).map(o => o.textContent.trim()) }); })()"
$AB screenshot /tmp/charity-5-goals.png

echo "== CLEANUP =="
$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
