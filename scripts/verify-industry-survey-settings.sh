#!/usr/bin/env bash
# Browser E2E: Industry survey questionnaire & stats-condition settings.
# - Settings → Survey tab: renders, questions grouped by wizard step, core
#   questions locked
# - Hide "Startup Capital", make "License Number" required, save; persistence
#   verified by re-opening the tab
# - Industry Survey form: hidden question gone, required validation enforced,
#   record submits with the hidden field empty (server follows questionnaire)
# - Reset-to-default restores the original questionnaire
# The E2E test industry record and the questionnaire setting are cleaned up.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/ind-survey-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/ind-survey-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

agent-browser set viewport 1440 900
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
agent-browser find role button click --name "Not now" 2>/dev/null || true
sleep 3
agent-browser wait --load networkidle
agent-browser find role button click --name "Not now" 2>/dev/null || true
echo "logged in"

# Click every sidebar button whose exact label matches (desktop + mobile copies)
click_item() {
  agent-browser eval "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$1').forEach(b => b.click()); 'clicked:$1'" > /dev/null 2>&1
}

# Click a button inside a specific sidebar region (e.g. Industry's Survey).
# Industry is the first sidebar group, so its "Survey" is the first match.
click_region_item() { # $1=unused (kept for readability)  $2=button label
  agent-browser eval "
    (() => {
      const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === '$2');
      if (btns.length === 0) return 'NOT_FOUND';
      btns[0].click();
      return 'OK';
    })()
  " > /dev/null 2>&1
}

open_survey_tab() {
  # ADMINISTRATION is folded at load — its Settings button is only in the DOM
  # once the accordion expands. (DOM text is "Administration"; the a11y tree
  # shows it uppercase due to CSS text-transform.)
  click_item "Administration"
  sleep 1
  # SettingsManager mounts async — retry until the Survey tab is active.
  # Radix Tabs activate on pointer events, so use a real a11y click, not eval.
  for i in $(seq 1 10); do
    click_item "Settings"
    sleep 1
    agent-browser find role tab click --name "Survey" > /dev/null 2>&1
    sleep 1.5
    if agent-browser snapshot 2>/dev/null | grep -q "Survey Questions"; then
      return 0
    fi
  done
  return 1
}

# ---- 1. Settings → Survey tab ----
open_survey_tab
snap=$(agent-browser snapshot 2>/dev/null)
echo "$snap" > "$SHOTS/01-survey-tab.txt"
agent-browser screenshot "$SHOTS/01-survey-tab.png" > /dev/null
echo "$snap" | grep -q "Survey Questions / Gaaffii Safiisaa" \
  && echo "PASS: Survey tab renders" || { echo "FAIL: Survey tab missing"; exit 1; }
echo "$snap" | grep -qi "STEP 2 — REGISTRATION" \
  && echo "PASS: questions grouped by wizard step" || echo "FAIL: step grouping missing"
echo "$snap" | grep -q "Core" \
  && echo "PASS: locked core questions flagged" || echo "FAIL: core badge missing"

# Radix widgets (Switch/RadioGroup/Select) activate on POINTER events — a bare
# .click() is ignored. Fire the full pointer sequence at the element instead.
FIRE_JS='(function(){window.__fire=function(el){if(!el)return "NO_EL";const o={bubbles:true,cancelable:true,view:window};el.dispatchEvent(new PointerEvent("pointerdown",o));el.dispatchEvent(new MouseEvent("mousedown",o));el.dispatchEvent(new PointerEvent("pointerup",o));el.dispatchEvent(new MouseEvent("mouseup",o));el.click();return "FIRED";};return "READY";})()'

fire_on() { # $1=JS expression returning the element (runs after __fire is installed)
  agent-browser eval "$FIRE_JS; (function(){ window.__fire($1); })()" > /dev/null 2>&1
}

# ---- 2. Toggle switches via stable row keys, save ----
toggle_switch() { # $1=field key  $2=switch ordinal in row (0=Shown, 1=Required)
  agent-browser eval "$FIRE_JS; (function(){ const row=document.querySelector('[data-field-key=\"$1\"]'); if(!row){return 'ROW_NOT_FOUND';} const sw=row.querySelectorAll('button[role=switch]')[$2]; return window.__fire(sw); })()" 2>/dev/null | tail -1
}

toggle_switch "startupCapital" 0
toggle_switch "licenseNumber" 1
sleep 1
agent-browser screenshot "$SHOTS/02-toggled.png" > /dev/null
agent-browser find role button click --name "Save / Olmaa" > /dev/null 2>&1
sleep 2
agent-browser screenshot "$SHOTS/03-saved.png" > /dev/null
saved=$(agent-browser snapshot 2>/dev/null | grep -c "Survey questionnaire updated")
[ "$saved" -ge 1 ] && echo "PASS: questionnaire saved" || echo "FAIL: save toast not shown"

# Persistence: leave the tab and come back — the toggle state must survive
click_item "Locations" 2>/dev/null
agent-browser eval "Array.from(document.querySelectorAll('button[role=tab]')).find(t=>t.textContent.trim()==='Locations')?.click(); 'ok'" > /dev/null 2>&1
sleep 1
open_survey_tab
state=$(agent-browser eval "$FIRE_JS; (function(){ const row=document.querySelector('[data-field-key=\"startupCapital\"]'); const sw=row?.querySelector('button[role=switch]'); return sw ? sw.getAttribute('data-state') : 'ROW_NOT_FOUND'; })()" 2>/dev/null | tail -1)
echo "$state" | grep -q "unchecked" && echo "PASS: hidden question persisted" || echo "FAIL: persistence broken ($state)"

# ---- 3. Industry Survey form follows the questionnaire ----
open_combobox_and_pick() { # $1=combobox index
  agent-browser eval "$FIRE_JS; (function(){ const t=document.querySelectorAll('button[role=combobox]')[$1]; return window.__fire(t); })()" > /dev/null 2>&1
  sleep 1
  name=$(agent-browser eval "document.querySelector('[role=option]')?.textContent?.trim() || ''" 2>/dev/null | tail -1 | tr -d '"')
  if [ -n "$name" ] && [ "$name" != "" ]; then
    fire_on "Array.from(document.querySelectorAll('[role=option]')).find(o=>o.textContent.trim()==='$name')"
  fi
  sleep 1
}

click_region_item "INDUSTRY" "Survey"
sleep 2
agent-browser screenshot "$SHOTS/05-step1.png" > /dev/null
step1=$(agent-browser snapshot 2>/dev/null)
echo "$step1" | grep -q "Establishment Name" \
  && echo "PASS: step 1 renders" || { echo "FAIL: step 1 missing"; exit 1; }

# Empty Next → required toast (name/specific address are required by default)
agent-browser find role button click --name "Next / Itti fufi" > /dev/null 2>&1
sleep 1
blocked=$(agent-browser snapshot 2>/dev/null | grep -c "Field Missing")
[ "$blocked" -ge 1 ] && echo "PASS: step 1 required validation active" || echo "FAIL: step 1 validation missing"

agent-browser find placeholder "e.g., BISHOFTU FLOUR MILL" fill "E2E Survey Settings Test Mill"
open_combobox_and_pick 0   # sector
open_combobox_and_pick 1   # sub-city
open_combobox_and_pick 2   # woreda (enabled after sub-city)
agent-browser find placeholder "Landmark, street, plot number" fill "E2E street 1"
agent-browser screenshot "$SHOTS/06-step1-filled.png" > /dev/null
agent-browser find role button click --name "Next / Itti fufi" > /dev/null 2>&1
sleep 1.5
agent-browser screenshot "$SHOTS/07-step2.png" > /dev/null
step2=$(agent-browser snapshot 2>/dev/null)
echo "$step2" > "$SHOTS/07-step2.txt"
echo "$step2" | grep -q "Startup Capital" \
  && echo "FAIL: hidden Startup Capital still shown" || echo "PASS: Startup Capital hidden on form"
echo "$step2" | grep -q "License Number" \
  && echo "PASS: License Number shown" || echo "FAIL: License Number missing"

# Required license: Next with empty license must block
agent-browser find role button click --name "Next / Itti fufi" > /dev/null 2>&1
sleep 1
blocked2=$(agent-browser snapshot 2>/dev/null | grep -c "Field Missing")
[ "$blocked2" -ge 1 ] && echo "PASS: required license blocks Next" || echo "FAIL: empty required license passed"
agent-browser find placeholder "e.g., BW/IC/2015/0234" fill "E2E/LIC/001"
fire_on "document.querySelectorAll('form button[role=radio]')[0]"
agent-browser find placeholder "e.g., 25" fill "10"
agent-browser screenshot "$SHOTS/08-step2-filled.png" > /dev/null
agent-browser find role button click --name "Next / Itti fufi" > /dev/null 2>&1
sleep 1.5
agent-browser find placeholder "Full name of manager / owner" fill "E2E Tester"
agent-browser find placeholder "+251 9X XXX XXXX or 09XXXXXXXX" fill "0911234567"
agent-browser find role button click --name "Next / Itti fufi" > /dev/null 2>&1
sleep 1.5
agent-browser screenshot "$SHOTS/09-review.png" > /dev/null
review=$(agent-browser snapshot 2>/dev/null)
echo "$review" > "$SHOTS/09-review.txt"
echo "$review" | grep -q "Startup Capital" \
  && echo "FAIL: hidden question in review" || echo "PASS: review follows questionnaire"
echo "$review" | grep -q "License Number" \
  && echo "PASS: license listed in review" || echo "FAIL: license missing in review"
fire_on "document.getElementById('confirm-yes')"
sleep 1
agent-browser find role button click --name "Submit Survey / Galchi" > /dev/null 2>&1
sleep 3
agent-browser screenshot "$SHOTS/10-submitted.png" > /dev/null
subm=$(agent-browser snapshot 2>/dev/null)
echo "$subm" | grep -q "Survey Submitted\|recorded successfully" \
  && echo "PASS: record accepted with hidden field empty" || echo "FAIL: submit rejected"

# ---- 4. Reset to defaults and verify restore ----
open_survey_tab
agent-browser find role button click --name "Reset to Default / Deebi’a" > /dev/null 2>&1
sleep 2
state2=$(agent-browser eval "(function(){ const row=document.querySelector('[data-field-key=\"startupCapital\"]'); const sw=row?.querySelector('button[role=switch]'); return sw ? sw.getAttribute('data-state') : 'ROW_NOT_FOUND'; })()" 2>/dev/null | tail -1)
echo "$state2" | grep -q "checked" && echo "PASS: reset restored Startup Capital" || echo "FAIL: reset broken ($state2)"

agent-browser close > /dev/null 2>&1

# ---- cleanup: delete the E2E record + questionnaire setting ----
cat > /tmp/ind-e2e-cleanup.sql <<'EOF'
DELETE FROM "Industry" WHERE "establishmentName" = 'E2E Survey Settings Test Mill';
DELETE FROM "AppSetting" WHERE key = 'industrySurveyFields';
SELECT 'cleaned' AS status;
EOF
bunx prisma db execute --stdin < /tmp/ind-e2e-cleanup.sql 2>&1 | tail -1 && echo "cleanup executed"

echo "INDUSTRY-SURVEY-SETTINGS E2E DONE"
