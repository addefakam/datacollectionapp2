#!/usr/bin/env bash
# Browser E2E: Ownership Type is fixed to a single option "SME" everywhere —
#   1) Survey form step 2: ownership radio shows ONLY "SME" (pre-selected),
#      legacy options (Private / Cooperative / Government / Public / NGO /
#      Faith-Based) gone.
#   2) Records table edit dialog: ownership select shows ONLY "SME".
#
# Read-only against production data: the survey form is filled but NEVER
# submitted, records dialogs are only opened — nothing is created, updated
# or deleted.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-ownership-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-ownership-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

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

click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}
# agent-browser eval wraps the string result in quotes and escapes inner
# quotes — undo that so rg patterns can match plain JSON.
jclean() { sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'; }
pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

pick_option() { # open the Radix select with the given trigger id and pick first option
  agent-browser eval "(() => { const t = document.getElementById('$1'); if (!t) return 'no-trigger'; t.click(); return 'opened'; })()" > /dev/null 2>&1
  sleep 1
  agent-browser eval "(() => { const o = document.querySelectorAll('[role=\"option\"]')[0]; if (!o) return 'no-option'; o.click(); return 'picked'; })()" > /dev/null 2>&1
  sleep 1
}

# --- open the Small Enterprise Survey tab ------------------------------------
click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
click_item "Survey"
sleep 2
agent-browser wait --load networkidle

# --- fill step 1 (never submitted; state dies when we navigate away) ----------
agent-browser eval "(() => {
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return 'no-' + id;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  };
  return JSON.stringify([setVal('enterpriseName', 'E2E OWNERSHIP CHECK'), setVal('specificAddress', 'E2E landmark')]);
})()" | jclean
pick_option "enterpriseType"
pick_option "subCity"
pick_option "area"
agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().startsWith('Next')).forEach(b => b.click()); 'next-clicked'" > /dev/null 2>&1
sleep 2

# --- assert ownership radios on step 2 ----------------------------------------
survey_raw=$(agent-browser eval "(() => {
  const radios = Array.from(document.querySelectorAll('[role=\"radio\"]')).filter(r => (r.id||'').startsWith('mse-ownership-'));
  const labels = radios.map(r => (document.querySelector('label[for=\"'+r.id+'\"]')||{textContent:''}).textContent.trim() || r.textContent.trim());
  const checked = radios.filter(r => r.getAttribute('aria-checked') === 'true' || r.getAttribute('data-state') === 'checked').map(r => r.id);
  return JSON.stringify({count: radios.length, labels: labels, checked: checked});
})()")
survey_json=$(echo "$survey_raw" | jclean)
echo "survey ownership: $survey_json"
echo "$survey_json" | rg -q '"count":1' && ok "survey form shows exactly 1 ownership option" || bad "survey form ownership option count != 1 ($survey_json)"
echo "$survey_json" | rg -q '"labels":\["SME"\]' && ok "survey ownership option label is SME" || bad "survey ownership label missing SME ($survey_json)"
echo "$survey_json" | rg -q '"checked":\["mse-ownership-SME"\]' && ok "SME ownership pre-selected by default" || bad "SME not pre-selected ($survey_json)"
legacy_missing=1
for opt in "Private" "Cooperative" "Government / Public" "NGO" "Faith-Based"; do
  echo "$survey_json" | rg -q "$opt" && { legacy_missing=0; break; }
done
[ "$legacy_missing" = "1" ] && ok "legacy ownership options removed from survey form" || bad "legacy ownership option still present ($survey_json)"
agent-browser screenshot --full-page "$SHOTS/survey-form.png" > /dev/null 2>&1

# --- open Records tab and the edit dialog -------------------------------------
click_item "Records"
sleep 3
agent-browser wait --load networkidle

edit_clicked=$(agent-browser eval "(() => {
  const btns = Array.from(document.querySelectorAll('button[title=\"Edit\"]'));
  if (!btns.length) return 'no-edit-buttons';
  btns[0].click();
  return 'clicked';
})()")
echo "edit click: $edit_clicked"
sleep 2

dialog_raw=$(agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  if (!dlg) return JSON.stringify({dialog: false});
  const combos = Array.from(dlg.querySelectorAll('[role=\"combobox\"]'));
  const own = combos.find(c => {
    let el = c;
    for (let i = 0; i < 4 && el; i++) {
      el = el.parentElement;
      const lbl = el && el.querySelector(':scope > label');
      if (lbl && lbl.textContent.trim() === 'Ownership') return true;
    }
    return false;
  });
  return JSON.stringify({dialog: true, ownershipValue: own ? own.textContent.trim() : 'trigger-not-found'});
})()")
dialog_json=$(echo "$dialog_raw" | jclean)
echo "edit dialog: $dialog_json"
echo "$dialog_json" | rg -q '"dialog":true' && ok "records edit dialog opens" || bad "edit dialog did not open"
echo "$dialog_json" | rg -q '"ownershipValue":"SME"' && ok "edit dialog ownership select shows SME" || bad "edit dialog ownership value unexpected ($dialog_json)"

# --- open the ownership select and count its options --------------------------
agent-browser eval "(() => {
  const dlg = document.querySelector('[role=\"dialog\"]');
  const combos = Array.from(dlg.querySelectorAll('[role=\"combobox\"]'));
  const own = combos.find(c => {
    let el = c;
    for (let i = 0; i < 4 && el; i++) {
      el = el.parentElement;
      const lbl = el && el.querySelector(':scope > label');
      if (lbl && lbl.textContent.trim() === 'Ownership') return true;
    }
    return false;
  });
  if (!own) return 'notfound';
  own.click();
  return 'opened';
})()" > /dev/null 2>&1
sleep 1

options_raw=$(agent-browser eval "(() => {
  const opts = Array.from(document.querySelectorAll('[role=\"listbox\"] [role=\"option\"]')).map(o => o.textContent.trim());
  return JSON.stringify({count: opts.length, options: opts});
})()")
options_json=$(echo "$options_raw" | jclean)
echo "ownership options: $options_json"
echo "$options_json" | rg -q '"count":1' && ok "edit dialog ownership select has exactly 1 option" || bad "edit dialog select option count != 1 ($options_json)"
echo "$options_json" | rg -q '"options":\["SME"\]' && ok "edit dialog ownership options = [SME] only" || bad "edit dialog options not SME-only ($options_json)"
agent-browser screenshot "$SHOTS/edit-dialog.png" > /dev/null 2>&1

echo ""
echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $fail
