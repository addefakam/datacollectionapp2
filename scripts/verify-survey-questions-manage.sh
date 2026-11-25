#!/usr/bin/env bash
# Browser E2E: "Survey Questions" management enabled in the Manage tab of ALL
# modules (Hotel, Health, Education, Agriculture, Small Enterprise).
#
# Verifies, read-only except two toggles that are reverted at the end:
#  1. every module Manage tab shows its own Survey Questions editor
#  2. hiding a question persists after Save (API round-trip via in-page fetch)
#  3. the Health survey form immediately follows the questionnaire (step 1
#     field disappears from the rendered form and comes back on restore)
#  4. Administration → Settings → Survey hosts all five editors
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3320
BASE="http://localhost:$PORT"
SHOTS=/tmp/surveyq-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/surveyq-server.log 2>&1 &
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

# --- sidebar helpers ---------------------------------------------------------
# Expand the accordion group $1 (no-op when already expanded).
nav_open() {
  agent-browser eval "(function(){var nav=document.querySelector('nav[aria-label=\"Management navigation\"]');if(!nav)return 'no-nav';var t=Array.from(nav.querySelectorAll('button')).find(function(b){return b.textContent.trim()==='$1'});if(!t)return 'no-trigger:$1';if(t.getAttribute('aria-expanded')==='true')return 'already-open:$1';t.click();return 'opened:$1';})()" 2>/dev/null | tail -1
  sleep 1.2
}
# Click the page button $2 that lives inside group $1's accordion subtree.
nav_click() {
  agent-browser eval "(function(group,item){var nav=document.querySelector('nav[aria-label=\"Management navigation\"]');var t=Array.from(nav.querySelectorAll('button')).find(function(b){return b.textContent.trim()===group;});if(!t)return 'no-trigger:'+group;var el=t.parentElement;while(el&&el!==document.body){var bs=Array.from(el.querySelectorAll('button'));if(bs.some(function(b){return b.textContent.trim()===item;})){bs.find(function(b){return b.textContent.trim()===item;}).click();return 'clicked:'+item+'-in-'+group;}el=el.parentElement;}return 'no-item:'+item+'-in-'+group;})('$1','$2')" 2>/dev/null | tail -1
  sleep 2.5
  agent-browser wait --load networkidle 2>/dev/null || true
}

pass=0; fail=0
ok()   { echo "PASS: $1"; pass=$((pass+1)); }
bad()  { echo "FAIL: $1"; fail=$((fail+1)); }

section_present() { # $1 sector id  $2 heading label
  agent-browser eval "!!document.querySelector('[data-survey-questions=\"$1\"]')" 2>/dev/null | tail -1 | grep -q true && ok "$2 editor mounted" || bad "$2 editor NOT mounted"
  agent-browser read > "$SHOTS/$1-manage.txt" 2>&1
  grep -q "Survey Questions — $2" "$SHOTS/$1-manage.txt" && ok "$2 editor heading" || bad "$2 editor heading missing"
  grep -q "Step 1 —" "$SHOTS/$1-manage.txt" && ok "$2 step groups" || bad "$2 step groups missing"
  grep -q "Save / Olmaa" "$SHOTS/$1-manage.txt" && ok "$2 Save button" || bad "$2 Save button missing"
  grep -q "Reset to Default" "$SHOTS/$1-manage.txt" && ok "$2 Reset button" || bad "$2 Reset button missing"
  agent-browser screenshot "$SHOTS/$1-manage.png" > /dev/null 2>&1
}

question_rows() { # $1 sector id  $2 expected rows  $3 label
  local n; n=$(agent-browser eval "document.querySelectorAll('[data-survey-questions=\"$1\"] [data-field-key]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
  echo "$3 question rows: $n"
  [ "$n" = "$2" ] && ok "$3 has $2 questions" || bad "$3 question count $n != $2"
}

# --- 1. every Manage tab shows its Survey Questions editor -------------------
nav_open "Hotel"; nav_click "Hotel" "Manage"
section_present "guesthouse" "Hotel & Guest House"
grep -q "Hotel & Guest House" "$SHOTS/guesthouse-manage.txt" && ok "guesthouse heading text" || bad "guesthouse heading text missing"
question_rows "guesthouse" 13 "guesthouse"

nav_open "Health"; nav_click "Health" "Manage"
section_present "health" "Health Facility"
question_rows "health" 16 "health"

nav_open "Education"; nav_click "Education" "Manage"
section_present "education" "Education Institution"
question_rows "education" 18 "education"

nav_open "Agriculture"; nav_click "Agriculture" "Manage"
section_present "agriculture" "Agriculture"
question_rows "agriculture" 16 "agriculture"

nav_open "Initiatives"; nav_open "Small Enterprise"; nav_click "Small Enterprise" "Manage"
section_present "small-enterprise" "Small Enterprise"
question_rows "small-enterprise" 15 "small-enterprise"

# --- 2. Settings → Survey hosts all five editors ------------------------------
nav_open "Administration"; nav_click "Administration" "Settings"
# Radix Tabs activate on pointerdown — a synthetic .click() alone is not enough.
agent-browser eval "(function(){var t=Array.from(document.querySelectorAll('[role=\"tab\"]')).find(function(x){return x.textContent.trim()==='Survey'});if(!t)return 'no-tab';t.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,button:0}));t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));t.click();return 'survey-tab';})()" > /dev/null 2>&1
nsec=0
for i in $(seq 1 12); do
  sleep 1
  nsec=$(agent-browser eval "document.querySelectorAll('[data-survey-questions]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
  [ "${nsec:-0}" -ge 5 ] 2>/dev/null && break
done
echo "settings sections: $nsec"
[ "${nsec:-0}" = "5" ] && ok "Settings Survey hosts 5 sector editors" || bad "Settings Survey hosts $nsec != 5 editors"
agent-browser screenshot "$SHOTS/settings-survey.png" > /dev/null 2>&1

# --- 3. toggle test on Health (reverted at the end) ----------------------------
nav_open "Health"; nav_click "Health" "Manage"

# 3a. hide "Inpatient Beds" (API round-trip proof)
agent-browser eval "(function(){var row=document.querySelector('[data-survey-questions=\"health\"] [data-field-key=\"bedCount\"]');if(!row)return 'no-row';var sw=row.querySelector('button[role=\"switch\"]');if(!sw)return 'no-switch';sw.click();return 'toggled-off';})()" > /dev/null 2>&1
sleep 0.6
agent-browser eval "(function(){var c=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.trim().startsWith('Save / Olmaa')&&b.closest('[data-survey-questions=\"health\"]');});if(!c)return 'no-save';c.click();return 'saved';})()" > /dev/null 2>&1
sleep 2
agent-browser read > "$SHOTS/health-saved.txt" 2>&1
grep -q "Saved / Olmaa" "$SHOTS/health-saved.txt" && ok "health questionnaire saved" || bad "health save toast missing"
bedstate=$(agent-browser eval "fetch('/api/settings/survey-fields/health').then(function(r){return r.json()}).then(function(d){return String(d.fields.find(function(f){return f.key==='bedCount'}).enabled)}).catch(function(){return 'ERR'})" 2>/dev/null | tail -1 | tr -d '"')
echo "bedCount enabled after hide: $bedstate"
[ "$bedstate" = "false" ] && ok "hide persisted to the API" || bad "hide did not persist ($bedstate)"

# 3b. hide "Specific Address" — visible immediately on wizard step 1
agent-browser eval "(function(){var row=document.querySelector('[data-survey-questions=\"health\"] [data-field-key=\"specificAddress\"]');if(!row)return 'no-row';row.querySelector('button[role=\"switch\"]').click();return 'toggled-off';})()" > /dev/null 2>&1
sleep 0.6
agent-browser eval "(function(){var c=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.trim().startsWith('Save / Olmaa')&&b.closest('[data-survey-questions=\"health\"]');});if(!c)return 'no-save';c.click();return 'saved';})()" > /dev/null 2>&1
sleep 2

# the survey form follows immediately
nav_click "Health" "Survey"
sleep 1
agent-browser eval "(function(){var txt=document.body.textContent;return JSON.stringify({addressGone:!txt.includes('Baka Addaa')&&!document.getElementById('specificAddress'),nameStill:txt.includes('Facility Name'),typeStill:txt.includes('Health facility information')});})()" > "$SHOTS/health-follow.json" 2>&1
sleep 0.5; cat "$SHOTS/health-follow.json"
tr -d '"\\\\' < "$SHOTS/health-follow.json" > "$SHOTS/health-follow.flat"
grep -q 'addressGone:true' "$SHOTS/health-follow.flat" && ok "form hides the hidden question" || bad "form still shows the hidden question"
grep -q 'nameStill:true' "$SHOTS/health-follow.flat" && ok "form keeps untouched questions" || bad "form lost untouched questions"
agent-browser screenshot "$SHOTS/health-survey-hidden.png" > /dev/null 2>&1

# --- 4. restore defaults and confirm the form heals -----------------------------
nav_click "Health" "Manage"
agent-browser eval "(function(){var r1=document.querySelector('[data-survey-questions=\"health\"] [data-field-key=\"bedCount\"]');var r2=document.querySelector('[data-survey-questions=\"health\"] [data-field-key=\"specificAddress\"]');if(!r1||!r2)return 'no-rows';r1.querySelector('button[role=\"switch\"]').click();r2.querySelector('button[role=\"switch\"]').click();return 'toggled-on-both';})()" > /dev/null 2>&1
sleep 0.6
agent-browser eval "(function(){var c=Array.from(document.querySelectorAll('button')).find(function(b){return b.textContent.trim().startsWith('Save / Olmaa')&&b.closest('[data-survey-questions=\"health\"]');});if(!c)return 'no-save';c.click();return 'saved';})()" > /dev/null 2>&1
sleep 2
restored=$(agent-browser eval "fetch('/api/settings/survey-fields/health').then(function(r){return r.json()}).then(function(d){return JSON.stringify({bed:d.fields.find(function(f){return f.key==='bedCount'}).enabled,addr:d.fields.find(function(f){return f.key==='specificAddress'}).enabled})}).catch(function(){return 'ERR'})" 2>/dev/null | tail -1 | tr -d '"\\\\')
echo "restored state: $restored"
grep -q 'bed:true' <<< "$restored" && grep -q 'addr:true' <<< "$restored" && ok "defaults restored in the API" || bad "restore failed ($restored)"

nav_click "Health" "Survey"
sleep 1
agent-browser eval "(function(){var txt=document.body.textContent;return JSON.stringify({addressBack:!!document.getElementById('specificAddress')&&txt.includes('Baka Addaa')});})()" > "$SHOTS/health-restored.json" 2>&1
sleep 0.5; cat "$SHOTS/health-restored.json"
tr -d '"\\\\' < "$SHOTS/health-restored.json" > "$SHOTS/health-restored.flat"
grep -q 'addressBack:true' "$SHOTS/health-restored.flat" && ok "form shows the restored question again" || bad "form did not restore the question"

echo ""
echo "==================================="
echo "E2E RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit "$fail"
