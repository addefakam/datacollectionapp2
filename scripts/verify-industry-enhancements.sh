#!/usr/bin/env bash
# Browser E2E: industry survey enhancements —
#  A) Administration → Settings → Sectors: add a sector; it appears in the
#     Industry survey Sector dropdown; the questionnaire editor lists the new
#     EIA/EMP date + Current Status questions.
#  B) Survey flow: EIA/EMP "Yes" reveal Date-of-Approval inputs; Current Status
#     Active/Inactive radio (default Active); review shows the values; submit.
#  C) Records: the new record shows the Status badge + approval dates.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/industry-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/industry-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

agent-browser set viewport 1440 1400
agent-browser open "$BASE/"
agent-browser wait --load networkidle

login_ok=0
for i in $(seq 1 15); do
  if agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null; then login_ok=1; break; fi
  sleep 2
done
[ "$login_ok" = "1" ] || { echo "FAIL: login form never rendered"; exit 1; }
agent-browser find placeholder "Enter your password" fill "admin123"
agent-browser find role button click --name "Sign In"
sleep 3
agent-browser wait --load networkidle
agent-browser find role button click --name "Not now" 2>/dev/null || true
echo "logged in"

# full real-pointer sequence (Radix opens on pointerdown)
pseq() {
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

# set an input value by CSS selector (selector must not contain single quotes)
set_val() {
  agent-browser eval "(() => {
    const el = document.querySelector(\"$1\");
    if (!el) return 'no-element';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '$2');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()" | jclean
}

# open a Radix select by selector and pick the option containing the text (or the first one)
pick_option() {
  agent-browser eval "(() => { const t = document.querySelector(\"$1\"); if (!t) return 'no-trigger'; t.click(); return 'opened'; })()" > /dev/null
  sleep 1
  if [ "$2" = "--first" ]; then
    agent-browser eval "(() => { const o = document.querySelector('[role=\"option\"]'); if (!o) return 'no-option'; o.click(); return 'picked'; })()" > /dev/null
  else
    agent-browser eval "(() => { const o = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('$2')); if (!o) return 'no-option'; o.click(); return 'picked'; })()" > /dev/null
  fi
  sleep 1
}

# plain .click() on an element (radios, buttons — Radix handles click)
click_el() {
  agent-browser eval "(() => { const el = document.querySelector(\"$1\"); if (!el) return 'no-element'; el.click(); return 'clicked'; })()" | jclean
}

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

body_has() {
  agent-browser eval "document.body.innerText.includes('$1') ? 'yes' : 'no'" | jclean
}

# ============ A) Settings: add a sector ========================================
click_item "Administration"
sleep 1
click_item "Settings"
sleep 2
agent-browser wait --load networkidle

# Radix tabs activate on mousedown — tab triggers need the real pointer sequence
settings_tab() {
  pseq "Array.from(document.querySelectorAll('[role=\"tab\"]')).find(t => t.textContent.trim() === '$1')"
  sleep 1
}

settings_tab "Sectors"
s=$(body_has "Industry Sectors / Goossota Indastrii")
[ "$s" = "yes" ] && ok "Settings → Sectors shows the 'Industry Sectors' section" || bad "Sectors section title missing"

agent-browser eval "(() => {
  const el = Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').includes('New sector'));
  if (!el) return 'no-element';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, 'E2E Solar Sector');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'set';
})()" | jclean
click_item "Add"
sleep 2
s=$(body_has "E2E Solar Sector")
[ "$s" = "yes" ] && ok "new sector 'E2E Solar Sector' saved and listed" || bad "sector not listed after add"

# Settings → Survey: the questionnaire editor lists the new questions (input values)
settings_tab "Survey"
sleep 3
s=$(agent-browser eval "(() => {
  const vals = Array.from(document.querySelectorAll('input')).map(i => i.value);
  return JSON.stringify({ eia: vals.includes('EIA Date of Approval'), emp: vals.includes('EMP Date of Approval'), status: vals.includes('Current Status') });
})()" | jclean)
echo "editor: $s"
echo "$s" | rg -q '"eia":true'    && ok "questionnaire editor lists 'EIA Date of Approval'" || bad "editor missing EIA date question ($s)"
echo "$s" | rg -q '"emp":true'    && ok "questionnaire editor lists 'EMP Date of Approval'" || bad "editor missing EMP date question ($s)"
echo "$s" | rg -q '"status":true' && ok "questionnaire editor lists 'Current Status'" || bad "editor missing Current Status question ($s)"

# ============ B) Survey flow ====================================================
click_item "Industry"
sleep 1
click_item "Survey"
sleep 2
agent-browser wait --load networkidle

set_val "#establishmentName" "E2E Industry Status Test"

# sector select → pick the new E2E sector
pick_option "#sector" "E2E Solar Sector"
s=$(agent-browser eval "document.querySelector('#sector')?.textContent || ''" | jclean)
echo "$s" | rg -q "E2E Solar Sector" && ok "new sector selectable in the survey Sector dropdown" || bad "sector dropdown does not show new sector ($s)"

# sub-city + woreda (first options)
pick_option "#subCity" "--first"
pick_option "#area" "--first"
set_val "#specificAddress" "E2E test address, Bishoftu"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click()); 'next'" > /dev/null
sleep 1

s=$(body_has "License, ownership and workforce details")
[ "$s" = "yes" ] && ok "advanced to Step 2 (Registration)" || bad "still on Step 1 — required fields rejected"

# Step 2: ownership first option, employee count
click_el "button[role=radio][id^=ownership-]"
sleep 1
set_val "#employeeCount" "10"
# EIA yes → date input appears
click_el "#eia-yes"
sleep 1
s=$(agent-browser eval "document.querySelector('#eiaApprovalDate') ? 'present' : 'missing'" | jclean)
[ "$s" = "present" ] && ok "EIA 'Yes' reveals the Date of Approval input" || bad "EIA date input did not appear ($s)"
set_val "#eiaApprovalDate" "2024-03-15"
# EMP yes → date input appears
click_el "#emp-yes"
sleep 1
s=$(agent-browser eval "document.querySelector('#empApprovalDate') ? 'present' : 'missing'" | jclean)
[ "$s" = "present" ] && ok "EMP 'Yes' reveals the Date of Approval input" || bad "EMP date input did not appear ($s)"
set_val "#empApprovalDate" "2024-04-02"
# Current Status radio: default Active checked, then choose Inactive
s=$(agent-browser eval "(() => { const a = document.querySelector('#status-active'); const i = document.querySelector('#status-inactive'); return JSON.stringify({ present: !!a && !!i, activeChecked: a ? a.checked || a.getAttribute('data-state') === 'checked' : false }); })()" | jclean)
echo "$s" | rg -q '"present":true'        && ok "Current Status Active/Inactive radio present" || bad "status radio missing ($s)"
echo "$s" | rg -q '"activeChecked":true'  && ok "Current Status defaults to Active" || bad "status radio not defaulting to Active ($s)"
click_el "#status-inactive"
sleep 1
s=$(agent-browser eval "(() => { const i = document.querySelector('#status-inactive'); return i && (i.checked || i.getAttribute('data-state') === 'checked') ? 'inactive-selected' : 'not-selected'; })()" | jclean)
[ "$s" = "inactive-selected" ] && ok "Inactive selectable on the Current Status radio" || bad "could not select Inactive ($s)"
agent-browser screenshot "$SHOTS/step2-dates-status.png" > /dev/null 2>&1 || true
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click()); 'next'" > /dev/null
sleep 1

# Step 3: contact
set_val "#contactName" "E2E Contact"
set_val "#contactPhone" "0912345678"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click()); 'next'" > /dev/null
sleep 1

# Step 4: review shows dates + status
s=$(agent-browser eval "(() => { const t = document.body.innerText; return JSON.stringify({ eiaDate: t.includes('2024-03-15'), empDate: t.includes('2024-04-02'), statusInactive: t.includes('Inactive'), statusLabel: t.includes('Current Status') }); })()" | jclean)
echo "review: $s"
echo "$s" | rg -q '"eiaDate":true'        && ok "review shows the EIA approval date" || bad "review missing EIA date ($s)"
echo "$s" | rg -q '"empDate":true'        && ok "review shows the EMP approval date" || bad "review missing EMP date ($s)"
echo "$s" | rg -q '"statusInactive":true' && ok "review shows Current Status = Inactive" || bad "review missing status ($s)"
# confirm the data-authenticity radio, then submit
click_el "#confirm-yes"
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Submit Survey')).forEach(b => b.click()); 'submit'" > /dev/null
sleep 3
agent-browser wait --load networkidle
s=$(body_has "Survey Submitted!")
[ "$s" = "yes" ] && ok "survey submitted successfully" || bad "submit did not succeed"

# ============ C) Records shows the new data =====================================
# The Industry group is already open after the survey — only unfold it if the
# Records button is missing (clicking an open accordion group would close it).
s=$(agent-browser eval "Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Records') ? 'present' : 'absent'" | jclean)
[ "$s" = "absent" ] && { click_item "Industry"; sleep 1; }
click_item "Records"
sleep 2
agent-browser wait --load networkidle
agent-browser eval "(() => { const i = document.querySelector('input[placeholder^=\"Search name\"]'); if (!i) return 'no-input'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(i, 'E2E Industry Status Test'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'searched'; })()" > /dev/null
sleep 2
s=$(agent-browser eval "(() => { const row = Array.from(document.querySelectorAll('tbody tr')).find(tr => tr.textContent.includes('E2E Industry Status Test')); return JSON.stringify({ found: !!row, status: row ? (row.textContent.includes('Inactive') ? 'inactive' : (row.textContent.includes('Active') ? 'active' : 'none')) : null, eiaDate: row ? row.textContent.includes('15/03/2024') : false, sector: row ? row.textContent.includes('E2E Solar Sector') : false }); })()" | jclean)
echo "record row: $s"
echo "$s" | rg -q '"found":true'    && ok "new record visible in Records" || bad "record not found in table ($s)"
echo "$s" | rg -q '"status":"inactive"' && ok "record shows the Inactive status badge" || bad "status badge wrong ($s)"
echo "$s" | rg -q '"eiaDate":true'  && ok "record shows the EIA approval date (15/03/2024)" || bad "EIA date missing in row ($s)"
echo "$s" | rg -q '"sector":true'   && ok "record shows the new sector" || bad "sector missing in row ($s)"
agent-browser screenshot "$SHOTS/records-new-row.png" > /dev/null 2>&1 || true

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
