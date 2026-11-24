#!/bin/bash
# Browser test: Dhibayyuu branding + dark sidebar + analytics dashboard
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

echo "== API smoke: /api/analytics/overview =="
curl -s http://localhost:3000/api/analytics/overview | head -c 600
echo ""

AB="agent-browser"
E() { $AB eval "$1"; }

$AB close 2>/dev/null || true
$AB set viewport 1440 900
$AB open http://localhost:3000 --timeout 30000
sleep 4

echo "== LOGIN PAGE =="
$AB screenshot /tmp/dhibayyuu-login.png && echo shot-login
E "document.body.textContent.includes('Qorannoo') && document.body.textContent.includes('Dhibayyuu') ? 'LOGIN BRANDED' : 'LOGIN BRANDING MISSING'"
E "document.body.textContent.includes('admin') ? 'CREDENTIALS HINT STILL PRESENT!' : 'CREDENTIALS HINT REMOVED'"

$AB find first "#username" fill "admin"
$AB find first "#password" fill "admin123"
$AB find first "button[type=submit]" click
sleep 5
$AB find text "Not now" click 2>/dev/null || echo "(no PWA prompt)"

echo "== DESKTOP: sidebar + brand =="
E "document.body.textContent.includes('Qorannoo Dhibayyuu') ? 'SIDEBAR BRAND Dhibayyuu' : 'BRAND MISSING'"
E "(() => { const aside = document.querySelector('aside'); const c = getComputedStyle(aside); return c.backgroundImage.includes('gradient') ? 'DARK GRADIENT SIDEBAR' : 'SIDEBAR BG: ' + c.backgroundImage.slice(0,40); })()"
E "document.body.textContent.includes('Analytics') ? 'ANALYTICS NAV ITEM PRESENT' : 'ANALYTICS NAV MISSING'"
$AB screenshot /tmp/dhibayyuu-desktop.png && echo shot1

echo "== NAVIGATE: Administration > Analytics =="
E "(() => { const b = Array.from(document.querySelectorAll('aside button')).find(x => x.textContent.trim()==='Analytics'); if(!b) return 'BTN NOT FOUND'; b.click(); return 'CLICKED'; })()"
sleep 5
E "document.querySelector('main').textContent.includes('Data Insights') ? 'ANALYTICS HERO LOADED' : 'ANALYTICS NOT LOADED'"
E "document.querySelectorAll('main svg.recharts-surface').length + ' recharts charts rendered'"
E "document.querySelector('main').textContent.includes('records · 5 modules') ? 'KPI CHIPS OK' : 'KPI CHIPS MISSING'"
E "document.querySelector('main').textContent.includes('People Counted, by Sex') ? 'SEX DONUT SECTION OK' : 'SEX SECTION MISSING'"
$AB screenshot /tmp/dhibayyuu-analytics.png && echo shot2

echo "== full-page analytics screenshot =="
E "window.scrollTo(0, document.body.scrollHeight)"
sleep 1.5
$AB screenshot /tmp/dhibayyuu-analytics-bottom.png && echo shot3
E "window.scrollTo(0, 0)"

echo "== MOBILE 390x844 =="
$AB set viewport 390 844
sleep 1.5
$AB find first "button[aria-label='Open navigation menu']" click
sleep 1.5
E "document.querySelector('[data-slot=sheet-content]') ? 'DRAWER OPEN' : 'NO DRAWER'"
E "(() => { const s = document.querySelector('[data-slot=sheet-content]'); return getComputedStyle(s).backgroundImage.includes('gradient') ? 'DARK DRAWER SURFACE' : 'DRAWER SURFACE WRONG'; })()"
$AB screenshot /tmp/dhibayyuu-mobile-drawer.png && echo shot4
E "(() => { const b = Array.from(document.querySelectorAll('[data-slot=sheet-content] button')).find(x => x.textContent.trim()==='Analytics'); if(!b) return 'ANALYTICS BTN NOT FOUND'; b.click(); return 'CLICKED'; })()"
sleep 5
E "!document.querySelector('[data-slot=sheet-content]') ? 'DRAWER CLOSED' : 'DRAWER STILL OPEN'"
E "document.querySelector('main').textContent.includes('Data Insights') ? 'ANALYTICS ON MOBILE LOADED' : 'ANALYTICS MOBILE FAIL'"
$AB screenshot /tmp/dhibayyuu-mobile-analytics.png && echo shot5

$AB close 2>/dev/null || true
echo "== dev.log errors (last 200 lines) =="
grep -iE "error|warn|failed" /tmp/dev.log | grep -v "DeprecationWarning" | tail -10 || echo "(no errors in dev log)"
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "UI TEST DONE"
