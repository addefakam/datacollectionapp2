#!/bin/bash
# Browser UI test: Education + Agriculture modules (survey submit, records, stats, mobile nav)
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
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
E "document.querySelector('header h1')?.textContent"
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== NAV: 6 DROPDOWN TRIGGERS =="
E "Array.from(document.querySelectorAll('main [role=tablist] > div > button, main [role=tablist] button')).filter(b=>b.querySelector('.lucide-chevron-down')).map(b=>b.textContent.trim().replace(/[^A-Za-z]/g,'')).join(',')"
E "Array.from(document.querySelectorAll('main [role=tablist] button')).filter(b=>b.textContent.includes('Education')).length + ' Education trigger(s)'"

echo "== EDUCATION SURVEY =="
$AB find text "Education" click
sleep 1
$AB find role menuitem click --name "Education Survey"
sleep 3
E "document.body.textContent.includes('Mana Barumsaa') || document.body.textContent.includes('Institution Name') ? 'EDU FORM OPEN' : 'EDU FORM MISSING'"

# Step 1
$AB find first "input[name='institutionName']" fill "UI TEST ACADEMY"
$AB find first "input[name='institutionName']" press Tab
# select institution type (Radix select)
E "(()=>{const t=document.querySelector('#e-institutionType');if(!t)return 'TRIGGER NOT FOUND';t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'TYPE TRIGGER CLICKED';})()"
sleep 1
E "(()=>{const opts=[...document.querySelectorAll('[role=option]')];const o=opts.find(x=>x.textContent.includes('Primary School'));if(!o)return 'OPT MISSING: '+opts.length;o.click();return 'TYPE SELECTED';})()"
sleep 1
# sub-city + wereda
E "(()=>{const t=document.querySelector('#e-subCity');t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'SUBCITY OPENED';})()"
sleep 1
E "(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim()==='Dukam');o.click();return 'SUBCITY SELECTED';})()"
sleep 1
E "(()=>{const t=document.querySelector('#e-area');t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'AREA OPENED';})()"
sleep 1
E "(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim()==='Odaa Nabee');if(!o)return 'AREA OPT MISSING';o.click();return 'AREA SELECTED';})()"
sleep 1
$AB find first "input[name='specificAddress']" fill "UI Test Street, Building 5"
E "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Next / Itti fufi'))?.textContent"

# go to step 2
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
E "document.body.textContent.includes('Ownership Type') ? 'STEP2 OPEN' : 'STEP2 NOT OPEN'"
# license + counts
$AB find first "input[name='licenseNumber']" fill "ED-UI-001"
$AB find first "input[name='studentCount']" fill "450"
$AB find first "input[name='teacherCount']" fill "22"
$AB find first "input[name='classroomCount']" fill "14"
# ownership radio (Government / Public)
E "(()=>{const items=[...document.querySelectorAll('[role=radio]')];const r=items.find(x=>x.value==='Government / Public');if(!r)return 'RADIO MISSING';r.click();return 'OWNERSHIP SET';})()"
sleep 1
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
E "document.body.textContent.includes('Contact Person') ? 'STEP3 OPEN' : 'STEP3 NOT OPEN'"
$AB find first "input[name='contactName']" fill "UI Test Director"
$AB find first "input[name='contactPhone']" fill "0912345678"
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
E "document.body.textContent.includes('UI TEST ACADEMY') ? 'STEP4 REVIEW SHOWS NAME' : 'REVIEW MISSING'"
# confirm yes
E "(()=>{const r=[...document.querySelectorAll('[role=radio]')].find(x=>x.id==='e-confirm-yes');if(!r)return 'CONFIRM RADIO MISSING';r.click();return 'CONFIRMED';})()"
sleep 1
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Submit Survey'));b.click();return 'SUBMITTED';})()"
sleep 4
E "document.body.textContent.includes('Survey Submitted') ? 'EDU SUBMIT OK' : 'EDU SUBMIT FAILED'"

echo "== EDUCATION RECORDS =="
$AB find text "Education" click
sleep 1
$AB find role menuitem click --name "Education Records"
sleep 4
E "document.body.textContent.includes('UI TEST ACADEMY') ? 'EDU RECORDS SHOW ROW' : 'EDU RECORDS MISSING'"
$AB screenshot /tmp/edu-records.png

echo "== EDUCATION STATS =="
$AB find text "Education" click
sleep 1
$AB find role menuitem click --name "Education Stats"
sleep 4
E "document.body.textContent.includes('450') && (document.body.textContent.includes('UI TEST')||document.body.textContent.includes('Institutions')) ? 'EDU STATS RENDER' : 'EDU STATS MISSING'"
$AB screenshot /tmp/edu-stats.png

echo "== AGRICULTURE SURVEY =="
$AB find text "Agriculture" click
sleep 1
$AB find role menuitem click --name "Agriculture Survey"
sleep 3
E "document.body.textContent.includes('Mana Qonnaa') || document.body.textContent.includes('Farm / Establishment Name') ? 'AGRI FORM OPEN' : 'AGRI FORM MISSING'"
$AB find first "input[name='farmName']" fill "UI TEST FARM"
E "(()=>{const t=document.querySelector('#a-farmType');t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'TYPE OPENED';})()"
sleep 1
E "(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.includes('Dairy Farming'));if(!o)return 'OPT MISSING';o.click();return 'TYPE SELECTED';})()"
sleep 1
E "(()=>{const t=document.querySelector('#a-subCity');t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'SUBCITY OPENED';})()"
sleep 1
E "(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim()==='Dukam');o.click();return 'SUBCITY OK';})()"
sleep 1
E "(()=>{const t=document.querySelector('#a-area');t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));t.click();return 'AREA OPENED';})()"
sleep 1
E "(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>x.textContent.trim()==='Odaa Nabee');if(!o)return 'AREA MISSING';o.click();return 'AREA OK';})()"
sleep 1
$AB find first "input[name='specificAddress']" fill "UI Test Farm Road"
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
E "document.body.textContent.includes('Land Size') ? 'AGRI STEP2 OPEN' : 'AGRI STEP2 NOT OPEN'"
$AB find first "input[name='landSizeHectares']" fill "8.5"
$AB find first "input[name='workerCount']" fill "12"
E "(()=>{const r=[...document.querySelectorAll('[role=radio]')].find(x=>x.value==='Private');if(!r)return 'RADIO MISSING';r.click();return 'OWNERSHIP SET';})()"
sleep 1
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
$AB find first "input[name='contactName']" fill "UI Test Farmer"
$AB find first "input[name='contactPhone']" fill "0923456789"
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Next / Itti fufi'));b.click();return 'NEXT';})()"
sleep 2
E "document.body.textContent.includes('UI TEST FARM') ? 'AGRI REVIEW OK' : 'AGRI REVIEW MISSING'"
E "(()=>{const r=[...document.querySelectorAll('[role=radio]')].find(x=>x.id==='a-confirm-yes');if(!r)return 'CONFIRM MISSING';r.click();return 'CONFIRMED';})()"
sleep 1
E "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Submit Survey'));b.click();return 'SUBMITTED';})()"
sleep 4
E "document.body.textContent.includes('Survey Submitted') ? 'AGRI SUBMIT OK' : 'AGRI SUBMIT FAILED'"

echo "== AGRICULTURE RECORDS + STATS =="
$AB find text "Agriculture" click
sleep 1
$AB find role menuitem click --name "Agriculture Records"
sleep 4
E "document.body.textContent.includes('UI TEST FARM') ? 'AGRI RECORDS SHOW ROW' : 'AGRI RECORDS MISSING'"
$AB screenshot /tmp/agri-records.png
$AB find text "Agriculture" click
sleep 1
$AB find role menuitem click --name "Agriculture Stats"
sleep 4
E "document.body.textContent.includes('8.5') || document.body.textContent.includes('Land') ? 'AGRI STATS RENDER' : 'AGRI STATS MISSING'"
$AB screenshot /tmp/agri-stats.png

echo "== MOBILE NAV (375px) =="
$AB set viewport 375 700
sleep 2
$AB screenshot /tmp/mobile-nav.png
E "(()=>{const triggers=[...document.querySelectorAll('main button')].filter(b=>b.textContent.includes('Chevron')||b.querySelector('svg.lucide-chevron-down'));const r=document.querySelectorAll('main [role=tablist]')[0];const rows=r?Math.round(r.getBoundingClientRect().height):0;return 'tablist height: '+rows+'px (two rows expected ~90px+)';})()"
E "[...document.querySelectorAll('main [role=tablist] button')].filter(b=>b.textContent.trim().match(/Industry|Hotel|Health|Education|Agriculture|Manage/)).length + ' module triggers visible'"
E "(()=>{const btn=[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('Education'));if(!btn)return 'NO EDU BTN';const r=btn.getBoundingClientRect();return (r.width>0&&r.right<=375)?'EDU TRIGGER FITS 375px':'OVERFLOW '+JSON.stringify(r.right);})()"

$AB close
kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
echo "== UI TEST COMPLETE =="
