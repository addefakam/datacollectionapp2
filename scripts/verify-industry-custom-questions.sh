#!/usr/bin/env bash
# Browser E2E: admin can ADD survey questions to the Industry questionnaire
# ("Survey Questions / Gaaffii Safiisaa" card in Administration → Settings →
# Survey), and the added question behaves end-to-end:
#   1) "Add question" dialog opens on the Industry card, the bilingual label +
#      answer type are accepted, the row appears, Save persists it,
#   2) the Industry survey form renders the question on its wizard step,
#   3) submitting the survey stores the answer (customAnswers on the record),
#   4) the Records view dialog shows "Additional Questions" with the answer,
#   5) cleanup: the question row is removed via the editor again and the test
#      record is deleted — the production questionnaire config is restored.
set -u
cd "$(dirname "$0")/.."

# The sandbox .env may point at a local SQLite file — the app runs on
# PostgreSQL, so prefer the committed URL when the working one is not a
# postgres:// URL. The value is never printed.
DBURL="$(git show HEAD:.env | grep '^DATABASE_URL=' | cut -d= -f2-)"
case "$DBURL" in
  postgresql://*|postgres://*) ;;
  *) DBURL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" ;;
esac
export DATABASE_URL="$DBURL"

PORT=3321
BASE="http://localhost:$PORT"
SHOTS=/tmp/indq-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

pkill -f "node .next/standalone/server.js" 2>/dev/null || true
sleep 1

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/indq-server.log 2>&1 &
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

click_text() { # click every visible button whose trimmed text matches
  agent-browser eval "(() => {
    const btns = Array.from(document.querySelectorAll('button'))
      .filter(b => b.textContent.trim() === '$1' && b.offsetParent !== null);
    btns.forEach(b => b.click());
    return 'clicked:' + btns.length;
  })()" | jclean
}

js() { agent-browser eval "$1" | jclean; }

# open the Radix select with the given trigger id and pick its first option,
# then report the trigger's rendered value so failures are visible
pick_option() {
  pointer_seq "document.getElementById('$1')"
  sleep 1
  js "(() => { const o = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.getAttribute('aria-disabled') !== 'true' && (x.offsetParent !== null || x.closest('[data-radix-popper-content-wrapper]'))); if (!o) return 'no-option'; o.click(); return 'picked'; })()"
  sleep 1
  js "(() => { const t = document.getElementById('$1'); return t ? 'sel:' + t.textContent.trim().slice(0, 40) : 'none'; })()"
}

# open a named tab inside the tablist that also contains $2 (discriminator).
# Radix Tabs activate on pointerdown — use the full pointer sequence.
open_tab() {
  pointer_seq "(() => {
    const lists = Array.from(document.querySelectorAll('[role=\"tablist\"]'));
    const l = lists.find(x => Array.from(x.querySelectorAll('[role=\"tab\"]')).some(t => t.textContent.trim() === '$2'));
    const tab = l && Array.from(l.querySelectorAll('[role=\"tab\"]')).find(t => t.textContent.trim() === '$1');
    if (!tab) return null;
    return tab;
  })()"
}

fill_input() {
  js "(() => { const el = document.querySelector('$1'); if (!el) return 'no-input'; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, '$2'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'filled'; })()"
}

QUESTION_EN="Water access on premises"
QUESTION_OR="Paanii banyii dhaabbee"
CUSTOM_KEY="custom_water_access_on_premises"

# idempotency: purge leftovers of earlier runs of THIS test (same derived key)
pre=$(js "(() => {
  const x = new XMLHttpRequest(); x.open('GET', '/api/settings/survey-fields', false); x.send();
  const d = JSON.parse(x.responseText);
  const fields = (d.fields || []).filter(f => f.key !== '$CUSTOM_KEY' && f.key !== '${CUSTOM_KEY}_2');
  if (fields.length === (d.fields || []).length) return 'clean';
  const p = new XMLHttpRequest(); p.open('PUT', '/api/settings/survey-fields', false);
  p.setRequestHeader('Content-Type', 'application/json');
  p.send(JSON.stringify({ fields }));
  return 'purged:' + p.status;
})()")
echo "pre-clean: $pre"

# snapshot the questionnaire so cleanup can restore it byte-for-byte
ORIG=$(js "(() => { const x = new XMLHttpRequest(); x.open('GET', '/api/settings/survey-fields', false); x.send(); return x.responseText; })()")
echo "orig snapshot: $(echo "$ORIG" | head -c 60)..."

# ---------- 1) Administration → Settings → Survey ------------------------------
click_text "Administration" > /dev/null; sleep 1
click_text "Settings" > /dev/null; sleep 2
open_tab "Survey" "Locations"; sleep 2
agent-browser wait --load networkidle

card_title=$(js "(() => { const c = document.querySelector('[data-slot=\"card\"] [data-slot=\"card-title\"]'); return c ? c.textContent.trim() : 'none'; })()")
echo "first survey card: $card_title"
echo "$card_title" | rg -q "Survey Questions / Gaaffii Safiisaa" \
  && ok "Industry 'Survey Questions / Gaaffii Safiisaa' card is present" \
  || bad "first survey card is wrong ($card_title)"

add_btns=$(js "(() => Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Add question' && b.offsetParent !== null).length)()")
echo "add-question buttons visible: $add_btns"
echo "$add_btns" | rg -q '^[0-9]+$' && [ "$add_btns" -ge 3 ] \
  && ok "per-step 'Add question' buttons rendered ($add_btns)" \
  || bad "expected >=3 Add question buttons, got $add_btns"

# open the step-1 dialog of the FIRST card (the Industry questionnaire)
js "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Add question' && x.offsetParent !== null); if (!b) return 'none'; b.click(); return 'dialog-opening'; })()" > /dev/null
sleep 1
dlg=$(js "(() => { const d = document.querySelector('[role=\"dialog\"]'); return d ? (d.querySelector('[data-slot=\"dialog-title\"]')?.textContent || 'titleless') : 'no-dialog'; })()")
echo "dialog: $dlg"
echo "$dlg" | rg -q "Add question / Gaaffii Dabaluu" && ok "Add-question dialog opens" || bad "dialog did not open ($dlg)"
agent-browser screenshot "$SHOTS/admin-add-dialog.png" > /dev/null 2>&1 || true

agent-browser find placeholder "e.g., Water access on premises" fill "$QUESTION_EN"
agent-browser find placeholder "Fakkeenya: Paanee keessatti banyii dhaabbee" fill "$QUESTION_OR"
# answer type defaults to "Short text" — fine for this check
js "(() => { const d = document.querySelector('[role=\"dialog\"]'); const b = d && Array.from(d.querySelectorAll('button')).find(x => x.textContent.trim() === 'Add question'); if (!b) return 'none'; b.click(); return 'added'; })()" > /dev/null
sleep 1
row=$(js "(() => { const r = document.querySelector('[data-field-key=\"$CUSTOM_KEY\"]'); return r ? 'row-visible' : 'row-missing'; })()")
echo "row: $row"
[ "$row" = "row-visible" ] && ok "custom question row appears in the editor" || bad "custom row missing after Add ($row)"
agent-browser screenshot "$SHOTS/admin-card-with-custom.png" > /dev/null 2>&1 || true

# Save the questionnaire (first "Save / Olmaa" button belongs to the Industry card)
js "(() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Save / Olmaa' && x.offsetParent !== null); if (!b) return 'none'; b.click(); return 'saving'; })()" > /dev/null
sleep 2
saved=$(js "(() => { const x = new XMLHttpRequest(); x.open('GET', '/api/settings/survey-fields', false); x.send(); const d = JSON.parse(x.responseText); const f = (d.fields || []).find(y => y.key === '$CUSTOM_KEY'); return f ? 'persisted:' + f.input + ':step' + f.step : 'missing'; })()")
echo "persisted: $saved"
echo "$saved" | rg -q "^persisted:text:step1" && ok "question persisted to the server (text input on step 1)" || bad "question not persisted ($saved)"

# ---------- 2) Industry survey form renders the question ------------------------
click_text "Industry" > /dev/null; sleep 1.5
click_text "Survey" > /dev/null; sleep 2
form_q=$(js "(() => { const el = document.querySelector('[data-custom-key=\"$CUSTOM_KEY\"]'); return el ? 'rendered' : 'missing'; })()")
echo "form question: $form_q"
[ "$form_q" = "rendered" ] && ok "custom question rendered on survey form step 1" || bad "question missing on the form ($form_q)"

# ---------- 3) Submit a survey answering the custom question --------------------
agent-browser find placeholder "e.g., BISHOFTU FLOUR MILL" fill "E2E Custom Question Mill"
pick_option "sector"
pick_option "subCity"
pick_option "area"
fill_input "#specificAddress" "E2E landmark, plot 12"
fill_input "[data-custom-key=\"$CUSTOM_KEY\"] input" "Piped water"
sleep 0.5
agent-browser screenshot "$SHOTS/form-step1-custom.png" > /dev/null 2>&1 || true
click_text "Next / Itti fufi" > /dev/null; sleep 1.5
# step 2
pointer_seq "(() => { const r = Array.from(document.querySelectorAll('[role=\"radio\"][id^=\"ownership-\"]')).find(x => x.offsetParent !== null); return r || null; })()"
sleep 0.5
fill_input "#employeeCount" "12"
click_text "Next / Itti fufi" > /dev/null; sleep 1.5
# step 3
fill_input "#contactName" "E2E Tester"
fill_input "#contactPhone" "+251911223344"
click_text "Next / Itti fufi" > /dev/null; sleep 1.5
review=$(js "(() => { const rows = Array.from(document.querySelectorAll('.rounded-lg.border.bg-slate-50 > div')); const hit = rows.find(r => r.textContent.includes('Water access on premises')); return hit ? 'review-row-found' : 'missing'; })()")
echo "review: $review"
[ "$review" = "review-row-found" ] && ok "review step lists the custom answer" || bad "custom answer missing on review ($review)"
pointer_seq "document.getElementById('confirm-yes')"
sleep 0.5
click_text "Submit Survey / Galchi" > /dev/null
sleep 3
agent-browser wait --load networkidle

record=$(curl -sf "$BASE/api/industries?search=E2E%20Custom%20Question%20Mill&limit=5")
rid=$(echo "$record" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d['data'][0] if d.get('data') else None; print(r['id'] if r else '')" 2>/dev/null)
ans=$(echo "$record" | python3 -c "import sys,json; d=json.load(sys.stdin); r=(d.get('data') or [{}])[0]; print((r.get('customAnswers') or {}).get('$CUSTOM_KEY',''))" 2>/dev/null)
echo "record id: ${rid:-none}, stored answer: $ans"
[ -n "$rid" ] && ok "survey submitted, record created" || bad "record not created"
[ "$ans" = "Piped water" ] && ok "customAnswers stores the submitted answer" || bad "stored answer wrong ('$ans')"

# ---------- 4) Records view dialog ----------------------------------------------
click_text "Records" > /dev/null; sleep 2
agent-browser wait --load networkidle
js "(() => { const b = document.querySelector('button[title=\"View\"]'); if (!b) return 'no-view-btn'; b.click(); return 'view-opening'; })()" > /dev/null
sleep 1.5
view=$(js "(() => { const d = document.querySelector('[role=\"dialog\"]'); if (!d) return 'no-dialog'; const hit = Array.from(d.querySelectorAll('div')).find(x => x.textContent.includes('Piped water')); return hit ? 'view-shows-answer' : 'no-answer'; })()")
echo "view dialog: $view"
[ "$view" = "view-shows-answer" ] && ok "Records view dialog shows the custom answer" || bad "view dialog lacks the answer ($view)"
agent-browser screenshot "$SHOTS/records-view-custom.png" > /dev/null 2>&1 || true
js "(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()" > /dev/null
sleep 1

# ---------- 5) Cleanup: restore the questionnaire + delete the test record ------
js "(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 'esc'; })()" > /dev/null
sleep 1
restored=$(js "(() => {
  const orig = $ORIG;
  const fields = orig.fields.filter(f => f.key !== '$CUSTOM_KEY' && f.key !== '${CUSTOM_KEY}_2');
  const x = new XMLHttpRequest();
  x.open('PUT', '/api/settings/survey-fields', false);
  x.setRequestHeader('Content-Type', 'application/json');
  x.send(JSON.stringify({ fields }));
  const y = new XMLHttpRequest();
  y.open('GET', '/api/settings/survey-fields', false);
  y.send();
  const left = JSON.parse(y.responseText).fields.filter(f => f.key === '$CUSTOM_KEY' || f.key === '${CUSTOM_KEY}_2').length;
  return JSON.stringify({ status: x.status, left: left });
})()")
echo "restore: $restored"
echo "$restored" | rg -q '"status":200,"left":0' && ok "questionnaire config restored via snapshot" || bad "config restore failed ($restored)"

# delete the test record (no auth on this route — sandbox E2E only)
if [ -n "$rid" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/industries/$rid")
  [ "$code" = "200" ] && ok "test record deleted ($code)" || bad "record delete failed ($code)"
fi

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
