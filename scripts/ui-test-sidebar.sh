#!/bin/bash
# Browser test: left vertical sidebar navigation (desktop aside + mobile drawer)
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
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 4
$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== DESKTOP 1440x900: sidebar layout =="
E "document.querySelector('aside') ? 'SIDEBAR PRESENT' : 'SIDEBAR MISSING'"
E "Array.from(document.querySelectorAll('aside [data-slot=accordion-item]')).length + ' NAV GROUPS (expect 6)'"
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).map(x => x.textContent.trim()); const need = ['Survey','Records','Stats','Attendance','Users','Settings','Meetings']; const missing = need.filter(l => !b.some(t => t === l)); return missing.length ? 'MISSING ITEMS: ' + missing.join(',') : 'ALL ITEM TYPES PRESENT (incl. admin-only)'; })()"
E "document.querySelector('header') ? (getComputedStyle(document.querySelector('header')).display === 'none' ? 'MOBILE HEADER HIDDEN ON DESKTOP' : 'HEADER STILL VISIBLE!') : 'NO HEADER'"
E "(() => { const h = document.querySelector('button[aria-label=\"Open navigation menu\"]'); return h && h.offsetParent === null ? 'HAMBURGER HIDDEN ON DESKTOP' : 'HAMBURGER VISIBLE!'; })()"
E "(() => { const act = Array.from(document.querySelectorAll('aside button')).filter(b => b.className.includes('bg-teal-600')); return act.length === 1 ? 'ACTIVE NAV: ' + act[0].textContent.trim() : 'ACTIVE COUNT WRONG: ' + act.length; })()"
E "document.body.textContent.includes('Qorannoo Indastrii') && document.body.textContent.includes('Logout') ? 'BRAND + LOGOUT IN SIDEBAR' : 'SIDEBAR FOOTER MISSING'"
$AB screenshot /tmp/sidebar-desktop.png && echo shot1

echo "== DESKTOP: click Education > Stats =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Stats' && x.closest('[data-slot=accordion-item]').textContent.includes('Education')); if(!b) return 'BTN NOT FOUND'; b.click(); return 'CLICKED'; })()"
sleep 3
E "document.querySelector('main').textContent.includes('Institution Distribution') ? 'EDUCATION STATS LOADED' : 'CONTENT NOT SWITCHED'"
E "(() => { const act = Array.from(document.querySelectorAll('aside button')).filter(b => b.className.includes('bg-teal-600')); return act.length===1 && act[0].textContent.trim()==='Stats' ? 'ACTIVE HIGHLIGHT CORRECT' : 'ACTIVE WRONG: ' + act.map(b=>b.textContent.trim()).join(','); })()"

echo "== DESKTOP: click Hotel > Attendance =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Attendance' && x.closest('[data-slot=accordion-item]').textContent.includes('Hotel')); if(!b) return 'BTN NOT FOUND'; b.click(); return 'CLICKED'; })()"
sleep 3
E "document.querySelector('main').textContent.includes('Attendance Summary') ? 'HOTEL ATTENDANCE LOADED' : 'CONTENT NOT SWITCHED'"
$AB screenshot /tmp/sidebar-desktop-att.png && echo shot2

echo "== DESKTOP: collapse/expand Agriculture group =="
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Agriculture')); t.click(); return t.getAttribute('data-state'); })()"
sleep 1
E "(() => { const t = Array.from(document.querySelectorAll('aside [data-slot=accordion-trigger]')).find(x => x.textContent.includes('Agriculture')); return 'STATE NOW: ' + t.getAttribute('data-state'); })()"

echo "== MOBILE 390x844: hamburger drawer =="
$AB set viewport 390 844
sleep 1.5
E "(() => { const h = document.querySelector('button[aria-label=\"Open navigation menu\"]'); return h && h.offsetParent !== null ? 'HAMBURGER VISIBLE' : 'HAMBURGER HIDDEN!'; })()"
E "document.querySelector('aside').offsetParent === null ? 'SIDEBAR HIDDEN ON MOBILE' : 'SIDEBAR STILL VISIBLE ON MOBILE!'"
$AB find first "button[aria-label='Open navigation menu']" click
sleep 1.5
E "document.querySelector('[data-slot=sheet-content]') ? 'DRAWER OPEN' : 'DRAWER NOT OPEN'"
E "Array.from(document.querySelectorAll('[data-slot=sheet-content] [data-slot=accordion-item]')).length + ' GROUPS IN DRAWER'"
E "(() => { const b = Array.from(document.querySelectorAll('[data-slot=sheet-content] button')).find(x => x.textContent.trim()==='Attendance' && x.closest('[data-slot=accordion-item]').textContent.includes('Hotel')); if(!b) return 'BTN NOT FOUND'; b.click(); return 'CLICKED'; })()"
sleep 3
E "!document.querySelector('[data-slot=sheet-content]') ? 'DRAWER CLOSED AFTER SELECT' : 'DRAWER STILL OPEN?'"
E "document.querySelector('main').textContent.includes('Attendance Summary') ? 'HOTEL ATTENDANCE LOADED (MOBILE)' : 'CONTENT NOT SWITCHED'"
$AB screenshot /tmp/sidebar-mobile.png && echo shot3

$AB close 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "UI TEST DONE"
