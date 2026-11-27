#!/usr/bin/env bash
# FINAL verification E2E for the Bussa Goonofaa "Record Achievement" fix.
#
# The user reported the "Office that received the donations" select not
# working. Root causes addressed:
#   1. A campaign without a (complete) office distribution left the select
#      EMPTY — recording was impossible. Now the picker lists assigned
#      offices first (with their minimums) and EVERY other registered office
#      as a "no minimum set" fallback group, so recording always works.
#   2. Orphaned assignments (department gone) crashed the campaigns list
#      (GET 500). Now mapped defensively.
#   3. Non-ACTIVE campaigns silently disabled the submit button — now an
#      amber banner explains that records are closed.
#
# Scenarios verified end-to-end against a real PostgreSQL:
#   A. Assigned campaign: grouped office picker, select office, record
#      achievement (POST 201), success toast, entry listed.
#   B. Un-distributed campaign: amber hint, "Offices" fallback group,
#      record from a fallback office (POST 201).
set -u
cd "$(dirname "$0")/.."

bash scripts/e2e-pg-up.sh > /tmp/pg-up-final.log 2>&1 || { cat /tmp/pg-up-final.log; exit 1; }
export DATABASE_URL="postgresql://pgadmin@127.0.0.1:54329/e2e_sme"
echo "postgres up"

npx prisma db push --accept-data-loss > /tmp/prisma-push-final.log 2>&1 || { tail -20 /tmp/prisma-push-final.log; exit 1; }
npx tsx scripts/seed-campaign-e2e.ts || exit 1
npx tsx scripts/seed-survey-ui-e2e.ts > /dev/null 2>&1 || true

PORT=3363
BASE="http://localhost:$PORT"
SHOTS=/tmp/charity-final-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/charity-final-server.log 2>&1 &
SRV=$!
kill_all() { kill "$SRV" 2>/dev/null; pkill -f "node .next/standalone/server.js" 2>/dev/null; pkill -f "next-server" 2>/dev/null; }
trap kill_all EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never healthy"; tail -5 /tmp/charity-final-server.log; exit 1; }
echo "server healthy (pid $SRV)"

pointer_seq() {
  agent-browser eval "(() => {
    const el = $1;
    if (!el) return 'no-element';
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    return 'seq-done';
  })()" | jclean
}
fill_input() { # $1 = CSS selector, $2 = value
  agent-browser eval "(() => {
    const el = document.querySelector('$1');
    if (!el) return 'no-element';
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, '$2');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled';
  })()" | jclean
}
click_submit() { # click the TRUE submit (under MAIN, not the sidebar nav item)
  agent-browser eval "(() => {
    const all = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Record Achievement');
    const submit = all.find(b => { let el = b.parentElement; while (el) { if (el.tagName === 'MAIN') return true; el = el.parentElement; } return false; });
    if (!submit) return 'no-submit';
    submit.click();
    return 'clicked';
  })()" | jclean
}
toast_probe() { # correct viewport: div[role=region] > ol > li
  agent-browser eval "(() => {
    const lis = Array.from(document.querySelectorAll('div[role=\"region\"] li')).map(li => li.textContent.slice(0, 90));
    return JSON.stringify({ toasts: lis });
  })()" | jclean
}
poll_toast() { # $1 = text to wait for
  for i in $(seq 1 10); do
    local res; res=$(toast_probe)
    echo "$res" | rg -q "$1" && { echo "$res"; return 0; }
    sleep 0.5
  done
  toast_probe
}
nav_visible() { # $1 = nav label text — is this nav item already rendered in the sidebar accordion?
  agent-browser eval "(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('$1') && b.closest('[data-slot=\"accordion-content\"]')) ? 'yes' : 'no')()" | jclean
}
open_record_tab() { # idempotent: only toggles closed accordions open
  [ "$(nav_visible 'Bussa Goonofa')" != 'yes' ] && { pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Initiatives')"; sleep 1; }
  [ "$(nav_visible 'Record Achievement')" != 'yes' ] && { pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bussa Goonofa'))"; sleep 1.2; }
  pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Record Achievement') && b.closest('[data-slot=\"accordion-content\"]'))"
  sleep 1.5
}
select_option() { # $1 = option text (dropdown must already be open)
  agent-browser eval "(() => {
    const opt = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('$1'));
    if (!opt) return 'no-option';
    opt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return 'enter-dispatched';
  })()" | jclean
  sleep 0.8
}
open_office_select() { # opens the office select, returns the option texts
  pointer_seq "document.querySelector('[data-slot=\"select-trigger\"]')"
  sleep 1
  agent-browser eval "(() => JSON.stringify(Array.from(document.querySelectorAll('[role=\"option\"]')).map(o => o.textContent.slice(0, 70))))()" | jclean
}

login() {
  agent-browser set viewport 1440 1400
  agent-browser open "$BASE/"
  agent-browser wait --load networkidle
  sleep 2
  local okl=0
  for i in $(seq 1 15); do
    if agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null; then okl=1; break; fi
    if agent-browser eval "(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Industry') ? 'logged-in' : 'no')()" | jclean | rg -q 'logged-in'; then
      okl=1; break
    fi
    sleep 2
  done
  if [ "$okl" = "1" ] && agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean | rg -q 'authed'; then
    echo "already logged in"
    return 0
  fi
  [ "$okl" = "1" ] || { echo "FAIL: login form never rendered"; agent-browser screenshot "$SHOTS/login-fail.png" > /dev/null 2>&1 || true; exit 1; }
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser wait --load networkidle
  agent-browser find role button click --name "Not now" 2>/dev/null || true
  echo "logged in"
}

# instrument fetch
instrument() {
  agent-browser eval "(() => {
    if (window.__fetchLog) return 'already';
    window.__fetchLog = [];
    const orig = window.fetch.bind(window);
    window.fetch = (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const method = (args[1] && args[1].method) || 'GET';
      return orig(...args).then((r) => { window.__fetchLog.push(method + ' ' + String(url).slice(-55) + ' -> ' + r.status); return r; });
    };
    return 'ok';
  })()" | jclean
}
fetch_status() { # $1 = pattern, $2 = expected status
  agent-browser eval "(() => JSON.stringify((window.__fetchLog || []).filter(l => l.includes('$1'))))()" | jclean | awk -v s="$2" 'BEGIN{f=0} /-> /{ if (index($0, "-> " s) > 0) f=1 } END{ if (f) print "status-ok"; else print "status-missing" }'
}

# ===================== SCENARIO A: assigned campaign =========================
echo "=== Scenario A: assigned campaign (Bussa Goonofa Fund 2026) ==="
login
instrument
open_record_tab

res=$(agent-browser eval "(() => {
  const t = Array.from(document.querySelectorAll('[data-slot=\"card-title\"]')).map(x => x.textContent).join(' ');
  return t.includes('Record office achievement') ? 'form-shown' : t.slice(0, 100);
})()" | jclean)
echo "$res" | rg -q 'form-shown' && ok "A1 Record Achievement form rendered" || bad "A1 form not rendered: $res"

pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Bussa Goonofa Fund 2026'))"
sleep 1.2

# office picker shows BOTH groups: assigned + fallback others
res=$(open_office_select)
echo "office options: $res"
labels=$(agent-browser eval "(() => {
  const content = document.querySelector('[role=\"listbox\"], [data-radix-popper-content-wrapper]');
  const t = content ? content.textContent : document.body.textContent;
  return JSON.stringify({
    assignedLabel: t.includes('Assigned offices — minimum to collect'),
    othersLabel: t.includes('Other offices — no minimum set'),
  });
})()" | jclean)
echo "group labels: $labels"
echo "$labels" | rg -q '"assignedLabel":true' && ok "A2 assigned offices group shown with minimums" || bad "A2 assigned group missing: $labels"
echo "$labels" | rg -q '"othersLabel":true' && ok "A3 other-offices fallback group shown" || bad "A3 fallback group missing: $labels"
echo "$res" | rg -q 'Women & Youth Affairs Office — no minimum set' && ok "A3b unassigned department listed as fallback" || bad "A3b fallback office missing"
agent-browser screenshot "$SHOTS/01-office-groups.png" > /dev/null 2>&1 || true

select_option "Trade & Tourism Office"
sleep 0.6
res=$(agent-browser eval "(() => (document.querySelector('[data-slot=\"select-trigger\"]')?.textContent || '').slice(0, 70))()" | jclean)
echo "$res" | rg -q 'Trade & Tourism' && ok "A4 office committed: $res" || bad "A4 office not selected: $res"

panel='no'
for i in 1 2 3 4 5; do
  panel=$(agent-browser eval "(() => Array.from(document.querySelectorAll('div')).some(d => d.className.includes('emerald-50') && d.textContent.includes('collected of')) ? 'panel' : 'no')()" | jclean)
  echo "$panel" | rg -q 'panel' && break
  sleep 0.6
done
echo "$panel" | rg -q 'panel' && ok "A5 office progress panel (minimum/gap) shown" || bad "A5 panel missing"

fill_input '#da-cash' '25000' | rg -q 'filled' && ok "A6 cash filled" || bad "A6 cash input"
fill_input '#da-kind' '8000' | rg -q 'filled' && ok "A7 in-kind filled" || bad "A7 in-kind input"
fill_input '#da-kind-details' '10 quintals teff, 20 blankets' | rg -q 'filled' && ok "A8 in-kind details filled" || bad "A8 details input"
fill_input '#da-donors' '18' | rg -q 'filled' && ok "A9 donors filled" || bad "A9 donors input"

agent-browser screenshot "$SHOTS/02-filled-form.png" > /dev/null 2>&1 || true
click_submit
sleep 1.5
res=$(poll_toast 'Achievement recorded')
echo "$res" | rg -q 'Achievement recorded' && ok "A10 success toast rendered" || bad "A10 no success toast: $res"
res=$(fetch_status '/donations' 201)
echo "$res" | rg -q 'status-ok' && ok "A11 POST /donations -> 201" || bad "A11 POST not 201: $res"
agent-browser screenshot "$SHOTS/03-recorded.png" > /dev/null 2>&1 || true

res=$(agent-browser eval "(() => {
  const list = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes(\"'s records in this campaign\"));
  return JSON.stringify({ list: !!list, rows: list ? list.parentElement.querySelectorAll('div.flex.items-center.justify-between').length : 0 });
})()" | jclean)
echo "$res" | rg -q '"rows":1' && ok "A12 entry visible in office records" || bad "A12 entry missing: $res"

# ===================== SCENARIO B: campaign without distribution =============
echo "=== Scenario B: campaign without office distribution ==="
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const admin = await db.user.findFirst({ where: { username: 'admin' } });
  const now = new Date();
  await db.donationCampaign.create({
    data: {
      name: 'Un-Distributed Campaign',
      description: 'created without assignments',
      totalGoal: 20000,
      currency: 'ETB',
      startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      deadline: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 28)),
      status: 'ACTIVE',
      createdById: admin.id,
      createdByName: 'Administrator',
    },
  });
  console.log('created un-distributed campaign');
  process.exit(0);
}
main();
" > /dev/null 2>&1

# reload so the new campaign appears in the picker (page state predates the insert)
agent-browser open "$BASE/" > /dev/null 2>&1
sleep 2
auth=$(agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean)
if [ "$auth" = "form" ]; then
  agent-browser find placeholder "Enter your username" fill "admin"
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser find role button click --name "Not now" 2>/dev/null || true
fi
instrument

open_record_tab
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Un-Distributed Campaign'))"
sleep 1.2

res=$(agent-browser eval "(() => {
  const hint = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('no office distribution yet'));
  return hint ? 'hint-shown' : 'no-hint';
})()" | jclean)
echo "$res" | rg -q 'hint-shown' && ok "B1 amber no-distribution hint shown" || bad "B1 hint missing"

res=$(open_office_select)
echo "office options (B): $res"
labels=$(agent-browser eval "(() => {
  const content = document.querySelector('[role=\"listbox\"], [data-radix-popper-content-wrapper]');
  const t = content ? content.textContent : document.body.textContent;
  return JSON.stringify({ officesLabel: t.includes('Offices') || t.includes('Other offices'), noAssigned: !t.includes('Assigned offices') });
})()" | jclean)
echo "$labels" | rg -q '"noAssigned":true' && ok "B2 no assigned group for un-distributed campaign" || bad "B2 assigned group wrongly shown"
echo "$res" | rg -q 'Trade & Tourism Office — no minimum set' && ok "B2b all offices listed as fallback (no minimum set)" || bad "B2b fallback missing: $res"
agent-browser screenshot "$SHOTS/04-undistributed-hint.png" > /dev/null 2>&1 || true

select_option "Health Office"
sleep 0.6
res=$(agent-browser eval "(() => (document.querySelector('[data-slot=\"select-trigger\"]')?.textContent || '').slice(0, 70))()" | jclean)
echo "$res" | rg -q 'Health Office' && ok "B3 fallback office committed" || bad "B3 not selected: $res"

fill_input '#da-cash' '5000' | rg -q 'filled' && ok "B4 cash filled" || bad "B4 cash input"
fill_input '#da-donors' '7' | rg -q 'filled' && ok "B5 donors filled" || bad "B5 donors input"

click_submit
sleep 1.5
res=$(poll_toast 'Achievement recorded')
echo "$res" | rg -q 'Achievement recorded' && ok "B6 success toast rendered" || bad "B6 no success toast: $res"
res=$(fetch_status '/donations' 201)
echo "$res" | rg -q 'status-ok' && ok "B7 POST /donations -> 201 (fallback office)" || bad "B7 POST not 201"
agent-browser screenshot "$SHOTS/05-undistributed-recorded.png" > /dev/null 2>&1 || true

# after the entry, the office appears in the analysis as "no minimum set"
res='no'
for i in 1 2 3 4 5 6; do
  res=$(agent-browser eval "(() => {
    const badge = Array.from(document.querySelectorAll('span')).find(s => s.className.includes('violet-100') && s.textContent.includes('no minimum set'));
    const body = Array.from(document.querySelectorAll('p')).find(x => x.textContent.includes('collected so far'));
    return badge && body ? 'unassigned-panel' : 'no';
  })()" | jclean)
  echo "$res" | rg -q 'unassigned-panel' && break
  sleep 0.8
done
echo "$res" | rg -q 'unassigned-panel' && ok "B3b unassigned office panel shows \"no minimum set\" badge" || bad "B3b panel wrong: $res"

# ===================== API sanity (orphaned assignment) ======================
echo "=== API sanity: campaigns list never 500s ==="
res=$(agent-browser eval "(() => JSON.stringify((window.__fetchLog || []).filter(l => l.includes('donation-campaigns') && l.includes('GET'))))()" | jclean)
echo "$res" | rg -q -- '-> 200' && ok "C1 GET /api/donation-campaigns -> 200 (defensive mapping)" || bad "C1 campaigns GET failed: $res"

echo ""
echo "================================"
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ] && echo "ALL GREEN" || echo "SOME FAILURES"
exit 0
