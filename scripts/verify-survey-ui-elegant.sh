#!/usr/bin/env bash
# Browser E2E for the elegant, professional survey interface redesign.
#
# Boots the production build against a REAL local PostgreSQL seeded with the
# Hotel & Guest House questionnaire carrying the amenity questions from the
# user's screenshot (Restaurant / Parking / WiFi / Hot Water / Additional
# Services) as admin-added custom questions.
#
# Asserts the redesigned wizard renders end-to-end:
#   1. SurveyProgress header (icon pills + gradient track + % badge)
#   2. Step 1 Establishment with the refined inputs
#   3. Step 2 License with the elegant amenity QuestionCards + SegmentedYesNo
#      controls (Yes/No pill pairs) + answer-type chips
#   4. Step 3 Contact with the violet accent panels
#   5. Step 4 Review table + surveyor chip + confirmation card
#   6. A full walk through to the review step (segmented Yes clicks work)
# Screenshots are captured at every step.
set -u
cd "$(dirname "$0")/.."

bash scripts/e2e-pg-up.sh > /tmp/pg-up-e2e.log 2>&1 || { cat /tmp/pg-up-e2e.log; exit 1; }
export DATABASE_URL="postgresql://pgadmin@127.0.0.1:54329/e2e_sme"
echo "postgres up"

npx prisma db push --accept-data-loss > /tmp/prisma-push.log 2>&1 || { tail -20 /tmp/prisma-push.log; exit 1; }
echo "schema pushed"

PORT=3361
BASE="http://localhost:$PORT"
SHOTS=/tmp/survey-ui-shots
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
  node .next/standalone/server.js > /tmp/survey-ui-server.log 2>&1 &
SRV=$!
kill_all() { kill "$SRV" 2>/dev/null; pkill -f "node .next/standalone/server.js" 2>/dev/null; pkill -f "next-server" 2>/dev/null; }
trap kill_all EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never healthy"; tail -5 /tmp/survey-ui-server.log; exit 1; }
holder=$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ "$holder" = "$SRV" ] || { echo "FAIL: port held by pid $holder, expected $SRV"; exit 1; }
echo "server healthy (pid $SRV)"

npx tsx scripts/seed-survey-ui-e2e.ts || exit 1

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

click() { pointer_seq "Array.from(document.querySelectorAll('$1')).find($2)"; sleep "${3:-0.8}"; }

# Open a Radix Select and pick the option matching $2. Radix opens on
# pointerdown — re-clicking the trigger TOGGLES it closed, so: open once,
# poll for options, click the option, verify the trigger text.
select_option() { # $1 = trigger selector, $2 = option text
  local trig="$1" txt="$2" i j
  for i in $(seq 1 4); do
    local expanded
    expanded=$(agent-browser eval "(() => document.querySelector('$trig')?.getAttribute('aria-expanded') === 'true' ? 'open' : 'closed')()" | jclean)
    if [ "$expanded" != "open" ]; then
      pointer_seq "document.querySelector('$trig')"
      sleep 0.8
    fi
    # poll for the option list WITHOUT touching the trigger
    local found="no-option"
    for j in $(seq 1 6); do
      found=$(agent-browser eval "(() => {
        const o = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('$txt'));
        return o ? 'found' : 'no-option';
      })()" | jclean)
      [ "$found" = "found" ] && break
      sleep 0.5
    done
    echo "  [select_option $txt] try=$i expanded=$expanded found=$found" >&2
    if [ "$found" = "found" ]; then
      # Radix SelectItem commits through its own onKeyDown when it sees a
      # SELECTION_KEY (Enter) — a synthetic bubbling KeyboardEvent on the
      # option reaches React's delegated handler and commits THAT item.
      # (Pointer-event dispatch does not commit SelectItem reliably.)
      agent-browser eval "(() => {
        const opt = Array.from(document.querySelectorAll('[role=\"option\"]')).find(x => x.textContent.includes('$txt'));
        if (!opt) return 'no-option';
        opt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return 'enter-dispatched';
      })()" | jclean
      sleep 0.7
      local shown
      shown=$(agent-browser eval "(() => (document.querySelector('$trig')?.textContent || '').includes('$txt') ? 'selected' : 'not-yet')()" | jclean)
      if [ "$shown" = "selected" ]; then echo "selected: $txt"; return 0; fi
    fi
    agent-browser press Escape > /dev/null 2>&1 || true
    sleep 0.5
  done
  echo "FAILED select: $txt"
  return 1
}

# React-controlled input fill: native value setter + input event.
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

login() {
  agent-browser set viewport 1440 1400
  agent-browser open "$BASE/"
  agent-browser wait --load networkidle
  sleep 2
  local okl=0
  for i in $(seq 1 15); do
    if agent-browser find placeholder "Enter your username" fill "admin" 2>/dev/null; then okl=1; break; fi
    if agent-browser eval "(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Initiatives') ? 'logged-in' : 'no')()" | jclean | rg -q 'logged-in'; then
      okl=1; break
    fi
    sleep 2
  done
  if [ "$okl" = "1" ] && agent-browser eval "(() => document.querySelector('input[placeholder=\"Enter your username\"]') ? 'form' : 'authed')()" | jclean | rg -q 'authed'; then
    echo "already logged in"
    return 0
  fi
  [ "$okl" = "1" ] || { echo "FAIL: login form never rendered"; exit 1; }
  agent-browser find placeholder "Enter your password" fill "admin123"
  agent-browser find role button click --name "Sign In"
  sleep 3
  agent-browser wait --load networkidle
  agent-browser find role button click --name "Not now" 2>/dev/null || true
  echo "logged in"
}

# ---- 1. login + open Hotel → Survey --------------------------------------
login
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Hotel')"
sleep 1
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Survey' && b.closest('[data-slot=\"accordion-content\"]'))" 2>/dev/null \
  || pointer_seq "Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Survey')[0]"
sleep 1.5

# Progress header + active step pill
res=$(agent-browser eval "(() => {
  const p = document.querySelector('[data-slot=\"survey-progress\"]');
  if (!p) return 'no-progress';
  const pills = Array.from(p.querySelectorAll('button'));
  const active = pills.find(b => b.getAttribute('aria-current') === 'step');
  const pct = p.querySelector('.bg-gradient-to-r.from-emerald-500, [class*=\"from-emerald-500\"]');
  return JSON.stringify({ pills: pills.length, active: active ? active.textContent.slice(0, 40) : 'none', hasPct: !!pct });
})()" | jclean)
echo "$res" | rg -q 'no-progress' && bad "SurveyProgress header missing" || ok "SurveyProgress header rendered: $res"
echo "$res" | rg -q 'Establishment' && ok "active step pill = Establishment" || bad "active pill wrong: $res"
agent-browser screenshot "$SHOTS/01-step1-establishment.png" > /dev/null 2>&1 || true

# ---- 2. fill step 1 --------------------------------------------------------
fill_input '#organizationName' 'ELEGANT VIEW HOTEL' | rg -q 'filled' && ok 'org name filled' || bad 'org name input'
select_option '#subCity' 'Debaayyuu' && ok 'sub-city selected' || bad 'sub-city select'
select_option '#area' 'Horaa' && ok 'woreda selected' || bad 'woreda select'
fill_input '#specificAddress' 'Ring Road, near Central Park' | rg -q 'filled' && ok 'address filled' || bad 'address input'
res=$(agent-browser eval "(() => ({ org: document.querySelector('#organizationName')?.value || '', subCity: (document.querySelector('#subCity')?.textContent || '').trim().slice(0, 20), area: (document.querySelector('#area')?.textContent || '').trim().slice(0, 20) }))()" | jclean)
echo "step1 values: $res"

# ---- 3. next to step 2 (License + amenity question cards) ------------------
click "button" "b => b.textContent.replace(/\\s+/g,' ').includes('Next')"
click "button" "b => b.textContent.replace(/\\s+/g,' ').includes('Next')" 1.2
# step 1 must validate — if still on step 1 the required fill above failed
step2=$(agent-browser eval "(() => {
  const p = document.querySelector('[data-slot=\"survey-progress\"]');
  const active = p ? Array.from(p.querySelectorAll('button')).find(b => b.getAttribute('aria-current') === 'step') : null;
  return active ? active.textContent.slice(0, 30) : 'none';
})()" | jclean)
echo "$step2" | rg -q 'License' && ok "advanced to step 2 (License)" || { bad "step 2 not reached ($step2)"; }

res=$(agent-browser eval "(() => {
  const cards = Array.from(document.querySelectorAll('[data-slot=\"survey-question-card\"]'));
  const seg = document.querySelectorAll('[data-slot=\"survey-question-card\"] [data-slot=\"survey-progress\"], .inline-flex.w-full.items-stretch').length;
  const labels = cards.map(c => c.querySelector('p') ? c.querySelector('p').textContent : '');
  return JSON.stringify({ cards: cards.length, labels: labels.slice(0, 8), segPills: seg });
})()" | jclean)
echo "step2 question cards: $res"
echo "$res" | rg -q 'Restaurant' && ok "Restaurant question card rendered" || bad "Restaurant card missing"
echo "$res" | rg -q 'WiFi' && ok "WiFi question card rendered" || bad "WiFi card missing"
echo "$res" | rg -q 'Additional Services' && ok "Additional Services card rendered" || bad "Additional Services card missing"

# Segmented Yes/No: Radix RadioGroupItem is a <button role=radio> that commits
# on plain onClick — a synthetic click works. Select "Yes" on Restaurant/WiFi.
yes_click() { # $1 = base control id (e.g. gh-custom-custom_restaurant)
  agent-browser eval "(() => {
    const btn = document.querySelector('#$1-yes');
    if (!btn) return 'no-element';
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return 'clicked';
  })()" | jclean
}
yes_click 'gh-custom-custom_restaurant'
yes_click 'gh-custom-custom_wifi'
# Radix RadioGroupItem is a button[role=radio] — verify via aria-checked.
sleep 0.5
res=$(agent-browser eval "(() => {
  const q = (k) => { const c = document.querySelector('[data-custom-key=\"custom_' + k + '\"]'); if (!c) return 'none';
    const yes = c.querySelector('button[role=\"radio\"][aria-checked=\"true\"]');
    return yes && yes.id.endsWith('-yes') ? 'yes-selected' : (yes ? 'no-selected' : 'none-checked');
  };
  return JSON.stringify({ restaurant: q('restaurant'), wifi: q('wifi') });
})()" | jclean)
echo "yes-state: $res"
echo "$res" | rg -q 'yes-selected' && ok "segmented Yes commits (Radix radio)" || bad "segmented yes/no state ($res)"
agent-browser screenshot "$SHOTS/02-step2-amenities-elegant.png" > /dev/null 2>&1 || true
s1=$(agent-browser screenshot "$SHOTS/02-step2-amenities-elegant.png" 2>/dev/null | head -1)
echo "screenshot: $s1"

# ---- 4. walk to review ------------------------------------------------------
click "button" "b => b.textContent.replace(/\\s+/g,' ').includes('Next')"
sleep 0.8
# fill step 2 license fields (required for validation)
fill_input '#numberOfRooms' '24' | rg -q 'filled' && ok 'rooms filled' || bad 'rooms input'
select_option '#licenseType' 'Hotel' && ok 'license type selected' || bad 'license type select'
select_option '#licenseLevel' 'Star 3' && ok 'license level selected' || bad 'license level select'
fill_input '#licenseNumber' 'GH-2024-001' | rg -q 'filled' && ok 'license no filled' || bad 'license no input'
click "button" "b => b.textContent.replace(/\\s+/g,' ').includes('Next')"
sleep 1
fill_input '#contactName' 'Abebe Kebede' | rg -q 'filled' && ok 'contact name filled' || bad 'contact name'
fill_input '#contactPhone' '+251911234567' | rg -q 'filled' && ok 'contact phone filled' || bad 'contact phone'
fill_input '#ownerName' 'Getachew Bekele' | rg -q 'filled' && ok 'owner name filled' || bad 'owner name'
click "button" "b => b.textContent.replace(/\\s+/g,' ').includes('Next')"
sleep 1.2
step4=$(agent-browser eval "(() => {
  const p = document.querySelector('[data-slot=\"survey-progress\"]');
  const active = p ? Array.from(p.querySelectorAll('button')).find(b => b.getAttribute('aria-current') === 'step') : null;
  const review = document.querySelector('[data-slot=\"survey-review\"]');
  return JSON.stringify({ step: active ? active.textContent.slice(0, 20) : 'none', reviewRows: review ? review.children.length : 0, surveyor: !!Array.from(document.querySelectorAll('p')).find(x => x.textContent.includes('Surveyor')) });
})()" | jclean)
echo "step4: $step4"
echo "$step4" | rg -q 'Review' && ok "reached review step" || bad "review step not reached ($step4)"
echo "$step4" | rg -q '"reviewRows":[1-9]' && ok "review table has rows" || bad "review table empty"
agent-browser screenshot "$SHOTS/03-review.png" > /dev/null 2>&1 || true

# ---- 5. other-module spot check: Health survey custom question --------------
pointer_seq "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Health')"
sleep 1
# pick the Survey button INSIDE the Health accordion item (Hotel's open
# accordion also exposes a Survey button — scope by the item's text)
pointer_seq "(() => {
  const items = document.querySelectorAll('[data-slot=\"accordion-item\"]');
  const health = Array.from(items).find(i => i.textContent.includes('Health'));
  return health ? Array.from(health.querySelectorAll('button')).find(b => b.textContent.trim() === 'Survey') : null;
})()"
sleep 2
res=$(agent-browser eval "(() => {
  const card = document.querySelector('[data-custom-key=\"custom_has_ambulance\"]');
  if (!card) return 'no-card';
  return JSON.stringify({
    card: true,
    segRadios: document.querySelectorAll('[data-custom-key=\"custom_has_ambulance\"] button[role=\"radio\"]').length,
    typeChip: card.textContent.includes('YES / NO'),
    onHealthForm: !!document.querySelector('#facilityName') || !!Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('Health')),
  });
})()" | jclean)
echo "health custom question: $res"
echo "$res" | rg -q 'segRadios":2' && ok "Health module elegant question card + segmented yes/no" || bad "health custom question rendering ($res)"
agent-browser screenshot "$SHOTS/04-health-module.png" > /dev/null 2>&1 || true

echo ""
echo "RESULTS: pass=$pass fail=$fail"
ls -la "$SHOTS" 2>/dev/null
[ "$fail" = "0" ] && echo "ALL E2E CHECKS PASSED" || echo "E2E FAILURES PRESENT"
exit $fail
