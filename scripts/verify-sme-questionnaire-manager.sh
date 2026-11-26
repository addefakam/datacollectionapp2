#!/usr/bin/env bash
# Browser E2E (write + cleanup): Small Enterprise Manage tab questionnaire
# manager — add a custom question, modify it, use it in the survey form, see
# the answer in Records, then remove everything created (test record + test
# question) so production data is untouched afterwards.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-qm-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-qm-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

agent-browser set viewport 1440 1500
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

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}
jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }
set_text() { # set a React-controlled input/textarea by id
  agent-browser eval "(() => {
    const el = document.getElementById('$1');
    if (!el) return 'no-el';
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, '$2');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()" > /dev/null 2>&1
}

# ============ 1. Manage tab: add a custom question to step 2 ==================
click_item "Initiatives"; sleep 1
click_item "Small Enterprise"; sleep 1
click_item "Manage"; sleep 2
agent-browser wait --load networkidle

t=$(agent-browser eval "(() => { const b = document.body.innerText; return JSON.stringify({title: b.includes('Survey Questions'), addBtns: Array.from(document.querySelectorAll('button')).filter(x => x.textContent.trim() === 'Add question').length}); })()" | jclean)
echo "manage: $t"
echo "$t" | rg -q '"title":true' && ok "questionnaire manager title present" || bad "manager title missing ($t)"
echo "$t" | rg -q '"addBtns":3' && ok "three Add-question buttons (one per step)" || bad "add buttons != 3 ($t)"

# open the step-2 add dialog (second Add question button)
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(x => x.textContent.trim() === 'Add question')[1].click()" > /dev/null 2>&1
sleep 1
dlg_set_text() { # set a React-controlled input/textarea inside the open dialog, by placeholder prefix
  agent-browser eval "(() => {
    const dlg = document.querySelector('[role=\"dialog\"]');
    if (!dlg) return 'no-dialog';
    const el = Array.from(dlg.querySelectorAll('$1')).find(e => (e.placeholder || '').startsWith('$2'));
    if (!el) return 'no-el';
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, '$3');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()" > /dev/null 2>&1
}
dlg_set_text "input" "e.g., Market linkage" "Market linkage needed"
dlg_set_text "input" "Fakkeenya" "Wal qabsiisuu marketplace barbaachisa"
# choose the dropdown answer type (first combobox inside the dialog)
agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  const combo = dlg.querySelector('[role=\"combobox\"]');
  combo.click(); return 'opened';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => {
  const opts = Array.from(document.querySelectorAll('[role=\"option\"]'));
  const t = opts.find(o => o.textContent.trim().startsWith('Dropdown'));
  if (!t) return 'notfound';
  t.click(); return 'picked';
})()" > /dev/null 2>&1
sleep 1
# options textarea (placeholder-guided) — fill via querySelector
agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  const ta = dlg.querySelector('textarea');
  if (!ta) return 'no-ta';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'Yes / Eyee\nNo / Lakki');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  const btns = Array.from(dlg.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Add question');
  if (!btns.length) return 'no-btn';
  btns[btns.length - 1].click(); return 'added';
})()" > /dev/null 2>&1
sleep 1

t=$(agent-browser eval "(() => {
  const row = document.querySelector('[data-field-key^=\"custom_\"]');
  if (!row) return JSON.stringify({row:false});
  return JSON.stringify({row:true, label: row.querySelector('input').value, hasTypeSelect: !!row.querySelector('[role=\"combobox\"]')});
})()" | jclean)
echo "custom row: $t"
echo "$t" | rg -q '"row":true' && ok "custom question row appears in manager" || bad "custom row missing ($t)"
echo "$t" | rg -q 'Market linkage needed' && ok "custom question label correct" || bad "custom label wrong ($t)"

# Save the questionnaire
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Save / Olmaa')[0].click()" > /dev/null 2>&1
sleep 2
t=$(agent-browser eval "(() => JSON.stringify({saved: document.body.innerText.includes('Survey questionnaire updated')}))()" | jclean)
echo "$t" | rg -q '"saved":true' && ok "questionnaire saved (toast shown)" || bad "save toast missing ($t)"
agent-browser screenshot --full-page "$SHOTS/manage-with-custom.png" > /dev/null 2>&1 || agent-browser screenshot "$SHOTS/manage-with-custom.png" > /dev/null 2>&1

# ============ 2. Survey form: custom question on step 2 + submit ==============
click_item "Survey"; sleep 2
agent-browser eval "(() => {
  const setVal = (id, v) => { const el = document.getElementById(id); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  setVal('enterpriseName', 'E2E CUSTOM QUESTION CHECK');
  setVal('specificAddress', 'E2E cleanup');
  return 'filled';
})()" > /dev/null 2>&1
pick() { agent-browser eval "document.getElementById('$1').click()" > /dev/null 2>&1; sleep 1; agent-browser eval "document.querySelectorAll('[role=\"option\"]')[0].click()" > /dev/null 2>&1; sleep 1; }
pick "enterpriseType"
pick "subCity"
pick "area"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click())" > /dev/null 2>&1
sleep 2

t=$(agent-browser eval "(() => {
  const block = document.querySelector('[data-custom-key^=\"custom_\"]');
  if (!block) return JSON.stringify({custom:false});
  return JSON.stringify({custom:true, label: block.querySelector('label').textContent.trim().slice(0, 60)});
})()" | jclean)
echo "survey custom: $t"
echo "$t" | rg -q '"custom":true' && ok "custom question renders on survey step 2" || bad "custom question missing on survey form ($t)"

# answer the custom dropdown (its combobox inside the custom block)
agent-browser eval "(() => {
  const block = document.querySelector('[data-custom-key^=\"custom_\"]');
  const combo = block.querySelector('[role=\"combobox\"]');
  if (!combo) return 'no-combo';
  combo.click(); return 'opened';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => {
  const opts = Array.from(document.querySelectorAll('[role=\"listbox\"] [role=\"option\"]'));
  const t = opts.find(o => o.textContent.trim() === 'Yes / Eyee');
  if (!t) return 'notfound';
  t.click(); return 'picked';
})()" > /dev/null 2>&1
sleep 1
# employee count then continue
set_text "employeeCount" "2"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click())" > /dev/null 2>&1
sleep 1
set_text "contactName" "E2E Tester"
set_text "contactPhone" "0911000000"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click())" > /dev/null 2>&1
sleep 1
# review should show the custom answer
t=$(agent-browser eval "(() => JSON.stringify({review: document.body.innerText.includes('Market linkage needed'), yes: document.body.innerText.includes('Yes / Eyee')}))()" | jclean)
echo "$t" | rg -q '"review":true' && ok "review step lists the custom question" || bad "custom question missing in review ($t)"
# submit
agent-browser eval "(() => {
  const radios = Array.from(document.querySelectorAll('[role=\"radio\"]')).filter(r => (r.id||'') === 'mse-confirm-yes');
  if (radios.length) radios[0].click();
  return 'confirmed';
})()" > /dev/null 2>&1
sleep 1
agent-browser find role button click --name "Submit Survey / Galchi"
sleep 3
t=$(agent-browser eval "(() => JSON.stringify({submitted: document.body.innerText.includes('Survey Submitted') || document.body.innerText.includes('recorded successfully')}))()" | jclean)
echo "$t" | rg -q '"submitted":true' && ok "survey with custom answer submitted" || bad "submission failed ($t)"

# ============ 3. Records: view shows the answer; delete the record ============
click_item "Records"; sleep 3
agent-browser wait --load networkidle
agent-browser eval "(() => {
  const inp = document.getElementById('search') || document.querySelector('input[placeholder*=\"earch\"]');
  if (!inp) return 'no-search';
  const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  s.call(inp, 'E2E CUSTOM QUESTION CHECK');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()" > /dev/null 2>&1
sleep 2
agent-browser eval "(() => {
  const btns = Array.from(document.querySelectorAll('button[title=\"View\"]'));
  if (!btns.length) return 'no-view';
  btns[0].click(); return 'opened';
})()" > /dev/null 2>&1
sleep 1
t=$(agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  if (!dlg) return JSON.stringify({dialog:false});
  return JSON.stringify({dialog:true, hasQ: dlg.textContent.includes('Market linkage needed'), answerYes: dlg.textContent.includes('Yes / Eyee')});
})()" | jclean)
echo "record view: $t"
echo "$t" | rg -q '"hasQ":true' && ok "record view shows the custom question answer" || bad "custom answer missing in view dialog ($t)"
agent-browser screenshot "$SHOTS/record-view.png" > /dev/null 2>&1
# close view, delete the test record
agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  const close = dlg.querySelector('button[aria-label=\"Close\"], button[data-slot=\"dialog-close\"]');
  (close || Array.from(dlg.querySelectorAll('button')).find(b => b.textContent.trim() === '' )).click();
  return 'closed';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => {
  const btns = Array.from(document.querySelectorAll('button[title=\"Delete\"]'));
  if (!btns.length) return 'no-del';
  btns[0].click(); return 'opened';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => {
  const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Delete');
  const inAlert = btns.filter(b => b.closest('[role=\"alertdialog\"]'));
  (inAlert[0] || btns[0]).click();
  return 'deleted';
})()" > /dev/null 2>&1
sleep 2
t=$(agent-browser eval "(() => JSON.stringify({gone: !document.body.innerText.includes('E2E CUSTOM QUESTION CHECK')}))()" | jclean)
echo "$t" | rg -q '"gone":true' && ok "test record deleted from Records" || bad "test record still visible"

# ============ 4. Manage tab: remove the custom question, save =================
click_item "Manage"; sleep 2
agent-browser wait --load networkidle
agent-browser eval "(() => {
  const row = document.querySelector('[data-field-key^=\"custom_\"]');
  if (!row) return 'no-row';
  const del = row.querySelector('button[title=\"Remove question\"]');
  if (!del) return 'no-del';
  del.click(); return 'removed';
})()" > /dev/null 2>&1
sleep 1
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Save / Olmaa')[0].click()" > /dev/null 2>&1
sleep 2
t=$(agent-browser eval "(() => JSON.stringify({cleaned: !document.querySelector('[data-field-key^=\"custom_\"]')}))()" | jclean)
echo "$t" | rg -q '"cleaned":true' && ok "custom question removed from questionnaire" || bad "custom question still present after removal"

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
