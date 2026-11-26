#!/usr/bin/env bash
# Browser E2E: Survey Questions can be added from Administration → Settings →
# Survey and flow through the whole data path:
#   1) the Survey settings tab shows the editor for every module,
#   2) a new "Yes / No" question can be added to the Health questionnaire
#      (Add question dialog) and persists after Save,
#   3) the Health survey form immediately renders the question on step 1,
#   4) the submitted answer is stored and shown in Records → View under
#      "Additional Questions",
#   5) the CSV export carries the new question as a column.
# Uses full real-pointer event sequences (Radix opens on pointerdown).
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3321
BASE="http://localhost:$PORT"
SHOTS=/tmp/survey-add-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/survey-add-server.log 2>&1 &
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

click_text() {
  agent-browser eval "(() => {
    const b = Array.from(document.querySelectorAll('button, [role=\"tab\"], a')).find(x => x.textContent.trim() === '$1' || x.textContent.trim().startsWith('$1'));
    if (!b) return 'not-found';
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    b.dispatchEvent(new PointerEvent('pointerdown', opts));
    b.dispatchEvent(new MouseEvent('mousedown', opts));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    b.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    b.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    return 'clicked';
  })()" | jclean
  sleep 1
}

# Radix Select: pointerdown opens the trigger reliably, keyboard Enter selects
# the option reliably (pointer-up on options does not register).
# $2 empty → pick the FIRST option; otherwise the first option containing $2.
sel_pick() {
  # open via pointer sequence on the trigger
  pointer_seq "$1"
  sleep 1
  # select the option (Enter keydown on the item → handleSelect)
  agent-browser eval "(() => {
    const opts = Array.from(document.querySelectorAll('[role=\"option\"]'));
    const opt = '$2' ? opts.find(o => o.textContent.includes('$2')) : opts[0];
    if (!opt) return 'no-option(' + opts.length + ')';
    opt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return 'picked:' + opt.textContent.trim().slice(0, 30);
  })()" | jclean
  sleep 1
}

# Click a button inside the topmost Radix dialog (per-step buttons behind the
# dialog share the same caption — never click those by accident).
click_in_dialog() {
  agent-browser eval "(() => {
    const b = Array.from(document.querySelectorAll('[role=\"dialog\"] button')).find(x => x.textContent.trim().startsWith('$1'));
    if (!b) return 'not-found';
    const opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    b.dispatchEvent(new PointerEvent('pointerdown', opts));
    b.dispatchEvent(new MouseEvent('mousedown', opts));
    b.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    b.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    b.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }));
    return 'clicked';
  })()" | jclean
  sleep 1
}

# ---------- login ----------------------------------------------------------------
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

# Deterministic starting point: restore the Health questionnaire to the
# registry defaults (previous runs may have left custom questions behind).
reset=$(agent-browser eval "fetch('/api/settings/survey-fields/health', { method: 'DELETE' }).then(r => r.status + '-reset')" | jclean)
echo "health questionnaire: $reset"

# ---------- 1) Administration → Settings → Survey -------------------------------
click_text "Administration"
click_text "Settings"
sleep 1
tabs=$(agent-browser eval "Array.from(document.querySelectorAll('[role=\"tab\"]')).map(t => t.textContent.trim()).join('|')" | jclean)
echo "$tabs" | grep -q "Survey" && ok "Settings has a Survey tab" || bad "Settings Survey tab missing ($tabs)"

click_text "Survey"
sleep 2
n_sections=$(agent-browser eval "document.querySelectorAll('[data-survey-questions]').length" | jclean)
[ "$n_sections" -ge 4 ] && ok "Survey settings shows $n_sections questionnaire editors (guesthouse/health/education/agriculture + SME)" || bad "expected >=4 questionnaire editors, got $n_sections"

add_buttons=$(agent-browser eval "Array.from(document.querySelectorAll('[data-survey-questions] button')).filter(b => b.textContent.trim().startsWith('Add question')).length" | jclean)
[ "$add_buttons" -ge 12 ] && ok "$add_buttons per-step 'Add question' buttons rendered" || bad "expected >=12 Add-question buttons, got $add_buttons"

# ---------- 2) add a Yes/No question to the Health questionnaire -----------------
# open the step-1 Add-question dialog of the health card
pointer_seq "(() => { const card = document.querySelector('[data-survey-questions=\\'health\\']'); if (!card) return null; return Array.from(card.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('Add question')); })()"
sleep 1
dlg=$(agent-browser eval "!!document.querySelector('[role=\"dialog\"]')" | jclean)
[ "$dlg" = "true" ] && ok "Add-question dialog opened" || bad "Add-question dialog did not open"

agent-browser eval "(() => { const d = document.querySelector('[role=\"dialog\"]'); const inputs = d.querySelectorAll('input'); const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; p.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(inputs[0], 'Has clean water source'); set(inputs[1], 'Banyii fifiri qaba'); return 'filled'; })()" | jclean > /dev/null

# choose answer type "Yes / No" in the dialog's Select
sel_pick "(() => { const d = document.querySelector('[role=\"dialog\"]'); return d.querySelector('[role=\"combobox\"]'); })()" "Yes / No"
picked=$(agent-browser eval "(() => { const d = document.querySelector('[role=\"dialog\"]'); return d.querySelector('[role=\"combobox\"]')?.textContent.trim() || 'empty'; })()" | jclean)
[ "$picked" = "Yes / No" ] && ok "answer type set to Yes / No" || bad "answer type not selected ($picked)"

agent-browser screenshot "$SHOTS/01-add-question-dialog.png"
click_in_dialog "Add question"
sleep 1
# dialog closed + new row appears in the health card
dlg2=$(agent-browser eval "!!document.querySelector('[role=\"dialog\"]')" | jclean)
[ "$dlg2" = "false" ] && ok "dialog closed after Add question" || bad "dialog still open after Add question"
key=$(agent-browser eval "(() => { const card = document.querySelector('[data-survey-questions=\\'health\\']'); const row = card && card.querySelector('[data-field-key=\\'custom_has_clean_water_source\\']'); return row ? row.getAttribute('data-field-key') : 'missing'; })()" | jclean)
[ "$key" = "custom_has_clean_water_source" ] && ok "new custom question row appears in the health editor" || bad "custom question row missing ($key)"

# Save the questionnaire — the health card's own Save button (every module
# editor has an identical "Save / Olmaa" caption).
pointer_seq "(() => { const card = document.querySelector('[data-survey-questions=\'health\']'); return Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Save')); })()"
sleep 2
saved=$(agent-browser eval "document.body.textContent.includes('Survey questionnaire updated') || document.body.textContent.includes('Saved')" | jclean)
[ "$saved" = "true" ] && ok "questionnaire save confirmed" || bad "save toast not seen"

# round-trip through the API (persists the custom field)
api_has=$(agent-browser eval "fetch('/api/settings/survey-fields/health').then(r => r.json()).then(d => JSON.stringify({ has: d.fields.some(f => f.key === 'custom_has_clean_water_source' && f.custom && f.enabled), input: (d.fields.find(f => f.key === 'custom_has_clean_water_source') || {}).input }))" | jclean)
echo "api: $api_has"
echo "$api_has" | grep -q '"has":true' && ok "GET /api/settings/survey-fields/health round-trips the custom question" || bad "custom question not persisted ($api_has)"

# ---------- 3) Health survey form renders the question ---------------------------
click_text "Health"
click_text "Survey"
sleep 2
custom_on_form=$(agent-browser eval "(() => { const el = document.querySelector('[data-custom-key=\\'custom_has_clean_water_source\\']'); return el ? el.textContent.slice(0, 80) : 'missing'; })()" | jclean)
echo "$custom_on_form" | grep -q "Has clean water source" && ok "Health survey form step 1 renders the added question" || bad "question missing on the form ($custom_on_form)"

# answer Yes on the custom question
pointer_seq "document.querySelector('#h-custom-custom_has_clean_water_source-yes')"
sleep 1

# fill step-1 required fields: name, facility type, sub-city, area, address
agent-browser find placeholder "e.g., BISHOFTU GENERAL HOSPITAL" fill "E2E Water Clinic"
# facility type select
sel_pick "document.querySelector('#facilityType')" "Health Center"
# sub-city select (first entry) + area (first entry of the enabled list)
sel_pick "document.querySelector('#subCity')" ""
sub=$(agent-browser eval "document.querySelector('#subCity')?.textContent.trim() || 'empty'" | jclean)
echo "sub-city picked: $sub"
echo "$sub" | grep -q "Select / Filadhu" && bad "sub-city not picked" || ok "sub-city picked"
sel_pick "document.querySelector('#area')" ""
area=$(agent-browser eval "document.querySelector('#area')?.textContent.trim() || 'empty'" | jclean)
echo "area picked: $area"
echo "$area" | grep -q "Select sub-city first\|Select / Filadhu" && bad "area not picked" || ok "area picked"
agent-browser find placeholder "Landmark, street, plot number" fill "E2E test street 1"

agent-browser screenshot "$SHOTS/02-form-step1-with-custom-question.png"

click_text "Next"
sleep 1
# step 2: ownership (radio) + staff count
pointer_seq "(() => document.querySelector('[id=\"h-ownership-Government / Public\"]'))()"
sleep 0.5
agent-browser find placeholder "e.g., 25" fill "12"
click_text "Next"
sleep 1
# step 3: contact
agent-browser find placeholder "Full name of manager / head nurse" fill "E2E Tester"
agent-browser find placeholder "+251 9X XXX XXXX or 09XXXXXXXX" fill "0912345678"
click_text "Next"
sleep 1
# step 4: review shows the custom question + confirm + submit
on_review=$(agent-browser eval "document.body.textContent.includes('Step 4 of 4')" | jclean)
[ "$on_review" = "true" ] && ok "reached the review step" || bad "never reached the review step"
review=$(agent-browser eval "document.body.textContent.includes('Has clean water source')" | jclean)
[ "$review" = "true" ] && ok "review step lists the custom question" || bad "custom question missing on review"
agent-browser screenshot "$SHOTS/03-form-review.png"
pointer_seq "document.querySelector('#h-confirm-yes')"
sleep 0.5
click_text "Submit Survey"
sleep 3
# deterministic check: the record really reached the server
stored=$(agent-browser eval "fetch('/api/healthcenters?search=E2E%20Water%20Clinic').then(r => r.json()).then(d => JSON.stringify({ count: d.total, custom: (d.data || []).length ? (d.data[0].customAnswers || null) : null }))" | jclean)
echo "stored: $stored"
echo "$stored" | grep -q '"count":1' && ok "record stored on the server" || bad "record not found on the server ($stored)"
echo "$stored" | grep -q 'custom_has_clean_water_source' && ok "custom answer stored on the record" || bad "customAnswers missing on the stored record ($stored)"
agent-browser screenshot "$SHOTS/04-submitted.png"

# ---------- 4) Records → View shows the answer -----------------------------------
click_text "Records"
sleep 2
view=$(pointer_seq "(() => { const btns = Array.from(document.querySelectorAll('button[title=\\'View\\']')); return btns[0] || null; })()")
sleep 1
extra=$(agent-browser eval "(() => { const rows = Array.from(document.querySelectorAll('[data-custom-key=\\'custom_has_clean_water_source\\']')); if (rows.length === 0) return 'missing'; return rows[0].textContent; })()" | jclean)
echo "$extra" | grep -q "Has clean water source" && ok "Records view dialog shows the custom question" || bad "view dialog missing the custom question ($extra)"
echo "$extra" | grep -qi "Yes" && ok "stored answer 'Yes' is displayed" || bad "answer not displayed ($extra)"
agent-browser screenshot "$SHOTS/05-records-view.png"
agent-browser eval "(() => { const b = Array.from(document.querySelectorAll('[role=\"dialog\"] button')).find(x => x.textContent.trim() === 'Cancel'); if (b) b.click(); return 'ok'; })()" | jclean > /dev/null
sleep 1

# ---------- 5) CSV export carries the custom column -------------------------------
csv_head=$(agent-browser eval "fetch('/api/healthcenters/export').then(r => r.ok ? r.text() : 'ERR-' + r.status).then(t => t.split('\\n')[0].split(',').filter(h => h.includes('Has clean water source')).length + '-cols')" | jclean)
[ "$csv_head" = "1-cols" ] && ok "CSV export includes 'Has clean water source' column" || bad "CSV export missing custom column ($csv_head)"

# ---------- cleanup: remove the E2E record and restore the questionnaire --------
cleanup=$(agent-browser eval "fetch('/api/healthcenters?search=E2E%20Water%20Clinic').then(r => r.json()).then(async d => { for (const it of d.data || []) { await fetch('/api/healthcenters/' + it.id, { method: 'DELETE' }); } await fetch('/api/settings/survey-fields/health', { method: 'DELETE' }); return 'deleted-' + (d.data || []).length + '-reset'; })" | jclean)
echo "cleanup: $cleanup"

echo "----------------------------------------"
echo "PASS: $pass  FAIL: $fail"
[ "$fail" = "0" ] || exit 1
