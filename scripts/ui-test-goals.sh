#!/bin/bash
# E2E test: Goals & Targets system (set weekly/monthly/yearly goals → live progress → achievement %)
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

echo "== AUTH: NextAdmin session via curl =="
rm -f /tmp/goals-cj
CSRF=$(curl -s -c /tmp/goals-cj http://localhost:3000/api/auth/csrf | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
LOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/goals-cj -c /tmp/goals-cj -X POST http://localhost:3000/api/auth/callback/credentials -H 'Content-Type: application/x-www-form-urlencoded' --data-urlencode "csrfToken=$CSRF" --data-urlencode "username=admin" --data-urlencode "password=admin123" --data-urlencode "json=true")
echo "login (expect 200): $LOGIN_CODE"

echo "== PRE-CLEAN: remove any existing goals (dev DB) =="
for GID in $(curl -s http://localhost:3000/api/goals | python3 -c "import sys,json; [print(g['id']) for g in json.load(sys.stdin)['data']]"); do
  curl -s -b /tmp/goals-cj -X DELETE http://localhost:3000/api/goals/$GID -o /dev/null -w "pre-clean deleted $GID: %{http_code}\n"
done

echo "== API SMOKE: goals =="
# 1. Unauthenticated POST must be rejected
NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"metric":"employees","periodType":"monthly","targetValue":5}')
echo "unauth POST (expect 401): $NOAUTH"
# 2. Monthly goal: 20 jobs this month (owner set)
MONTH_GOAL=$(curl -s -b /tmp/goals-cj -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"metric":"employees","periodType":"monthly","targetValue":20,"owner":"Job Creation Office"}')
MID=$(echo "$MONTH_GOAL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "monthly goal created: ${MID:-FAILED}"
# 3. Weekly goal: 3 enterprises this week
WEEK_GOAL=$(curl -s -b /tmp/goals-cj -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"metric":"enterprises","periodType":"weekly","targetValue":3}')
WID=$(echo "$WEEK_GOAL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "weekly goal created: ${WID:-FAILED}"
# 4. Yearly goal 2027 (upcoming period)
YEAR_GOAL=$(curl -s -b /tmp/goals-cj -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"metric":"enterprises","periodType":"yearly","refDate":"2027-06-01","targetValue":120}')
YID=$(echo "$YEAR_GOAL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "yearly goal created: ${YID:-FAILED}"
# 5. Duplicate rejection (same metric + monthly)
DUP=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/goals-cj -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' -d '{"metric":"employees","periodType":"monthly","targetValue":30}')
echo "duplicate check (expect 409): $DUP"
# 6. PUT adjust weekly target 3 -> 5
PUT=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/goals-cj -X PUT http://localhost:3000/api/goals/$WID -H 'Content-Type: application/json' -d '{"targetValue":5}')
echo "adjust target (expect 200): $PUT"
# 7. GET with live progress analysis
echo "== GET /api/goals (live progress) =="
curl -s http://localhost:3000/api/goals | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print('goals:', len(d))
for g in d:
    p = g['progress']
    print(f\"  {g['periodType']:8s} {g['metric']:12s} target={g['targetValue']:>5} actual={p['actual']:>4} achievement={p['achievementPct']:>6}% status={p['status']:9s} pace={p['pacePct']:>3}% expected={p['expectedByNow']:.1f} daysLeft={p['daysLeft']} trend={p['trendPct']} label={p['label']}\")
"

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

echo "== SIDEBAR: Goals item present =="
E "(() => { const btns = Array.from(document.querySelectorAll('aside button')); const b = btns.find(x => x.textContent.trim() === 'Goals'); if (!b) return 'GOALS ITEM MISSING'; b.click(); return 'GOALS CLICKED'; })()"
sleep 3
E "(() => { const h = Array.from(document.querySelectorAll('h2')).find(x => x.textContent.includes('Goals & Targets')); return h ? 'GOALS PAGE LOADED' : 'GOALS PAGE MISSING'; })()"

echo "== GOAL CARDS RENDERED =="
E "(() => { const cards = Array.from(document.querySelectorAll('[data-slot=card]')).filter(c => c.textContent.includes('% achieved')); return 'CARDS WITH ACHIEVEMENT %: ' + cards.length; })()"
E "(() => { const t = document.body.textContent; return (t.includes('On Track') || t.includes('Behind Pace') || t.includes('Achieved') || t.includes('Upcoming')) ? 'STATUS BADGES OK' : 'STATUS BADGES MISSING'; })()"
E "(() => { const t = document.body.textContent; return t.includes('Weekly Goals') && t.includes('Monthly Goals') && t.includes('Yearly Goals') ? 'PERIOD SECTIONS OK' : 'PERIOD SECTIONS MISSING'; })()"
E "(() => { const t = document.body.textContent; return (t.includes('Avg achievement') && t.includes('Active goals')) ? 'SUMMARY STRIP OK' : 'SUMMARY STRIP MISSING'; })()"
E "(() => { const t = document.body.textContent; return t.includes('vs previous') ? 'TREND COMPARISON OK' : 'TREND COMPARISON (no baseline shown)'; })()"
E "(() => { const t = document.body.textContent; return t.includes('Job Creation Office') ? 'OWNER DISPLAYED' : 'OWNER MISSING'; })()"
$AB screenshot /tmp/goals-desktop.png
echo "shot-goals-desktop"

echo "== NEW GOAL DIALOG FLOW =="
E "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('New Goal')); if (!b) return 'NEW GOAL BTN MISSING'; b.click(); return 'DIALOG OPENED'; })()"
sleep 2
E "(() => { const d = document.querySelector('[data-slot=dialog-content]'); if (!d) return 'DIALOG MISSING'; return d.textContent.includes('Set a New Goal') && d.textContent.includes('Metric') && d.textContent.includes('Target value') ? 'DIALOG FIELDS OK' : 'DIALOG FIELDS INCOMPLETE'; })()"
E "(() => { const d = document.querySelector('[data-slot=dialog-content]'); const btn = Array.from(d.querySelectorAll('button')).find(x => x.textContent.trim() === 'Cancel'); if (!btn) return 'CANCEL MISSING'; btn.click(); return 'DIALOG CLOSED'; })()"
sleep 1

echo "== MOBILE: drawer shows Goals =="
$AB set viewport 390 844
sleep 2
$AB find first "button[aria-label='Open navigation menu']" click 2>/dev/null || $AB find first "header button" click
sleep 2
E "(() => { const btns = Array.from(document.querySelectorAll('[data-slot=sheet-content] button')); const b = btns.find(x => x.textContent.trim() === 'Goals'); if (!b) return 'MOBILE GOALS MISSING'; b.click(); return 'MOBILE GOALS CLICKED'; })()"
sleep 3
E "(() => { const h = Array.from(document.querySelectorAll('h2')).find(x => x.textContent.includes('Goals & Targets')); return h ? 'MOBILE GOALS PAGE OK' : 'MOBILE GOALS PAGE MISSING'; })()"
$AB screenshot /tmp/goals-mobile.png
echo "shot-goals-mobile"
$AB close

echo "== CLEANUP: keep monthly+weekly as demo, remove yearly API goal =="
[ -n "$YID" ] && curl -s -b /tmp/goals-cj -X DELETE http://localhost:3000/api/goals/$YID -o /dev/null -w "deleted yearly $YID: %{http_code}\n"

echo "== dev.log errors =="
grep -iE "error|unhandled" /tmp/dev.log | grep -v "favicon" | head -5 || true
echo "E2E TEST DONE"
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
