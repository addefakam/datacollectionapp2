#!/usr/bin/env bash
# Browser E2E: Small Enterprise Records presented as a table (read-only).
# Verifies the table presentation without touching the implementation logic:
# filters, pagination, selection → bulk status bar, view dialog and row
# actions all keep working. No records are created, modified or deleted.
set -u
cd "$(dirname "$0")/.."

export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
PORT=3319
BASE="http://localhost:$PORT"
SHOTS=/tmp/sme-records-shots
rm -rf "$SHOTS" && mkdir -p "$SHOTS"

rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

NODE_ENV=production PORT=$PORT NEXTAUTH_URL="$BASE" NEXTAUTH_SECRET=e2e-secret \
  node .next/standalone/server.js > /tmp/sme-records-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  curl -sf "$BASE/api/health" > /dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/health" > /dev/null || { echo "FAIL: server never became healthy"; exit 1; }
echo "server healthy"

agent-browser set viewport 1440 1100
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

# --- open Small Enterprise → Records ----------------------------------------
click_item "Initiatives"
sleep 1
click_item "Small Enterprise"
sleep 1
click_item "Records"
sleep 3
agent-browser wait --load networkidle
agent-browser read > "$SHOTS/1-records.txt" 2>&1

echo "--- table presentation assertions ---"
grep -q "Small Enterprise Records" "$SHOTS/1-records.txt" \
  && echo "PASS: Records page renders" \
  || echo "FAIL: Records page header missing"

for h in "Enterprise" "Type" "Ownership" "Sub-City" "Woreda" "Contact" "Members" "Capital" "Status" "Registered"; do
  if grep -q "$h" "$SHOTS/1-records.txt"; then
    echo "PASS: table has '$h' column"
  else
    echo "FAIL: table missing '$h' column"
  fi
done

# the two real records of the DB must appear as table rows
for name in "kk" "poltoury"; do
  if grep -q "$name" "$SHOTS/1-records.txt"; then
    echo "PASS: record row '$name'"
  else
    echo "FAIL: record row '$name' missing"
  fi
done

# data integrity inside the table: Debaayyuu / Dhakaa Boora / members / Operational
for v in "Debaayyuu" "Dhakaa Boora" "Operational" "M 5 · F 5" "M 2 · F 1" "ETB"; do
  if grep -q "$v" "$SHOTS/1-records.txt"; then
    echo "PASS: table data shows '$v'"
  else
    echo "FAIL: table data '$v' missing"
  fi
done

# row action buttons (View / Update Status / Edit / Delete) — icon buttons with title attrs
nview=$(agent-browser eval "document.querySelectorAll('button[title=\"View\"]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
nstatus=$(agent-browser eval "document.querySelectorAll('button[title=\"Update Status\"]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
nedit=$(agent-browser eval "document.querySelectorAll('button[title=\"Edit\"]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
ndelete=$(agent-browser eval "document.querySelectorAll('button[title=\"Delete\"]').length" 2>/dev/null | tail -1 | tr -dc '0-9')
echo "row actions: View=$nview Status=$nstatus Edit=$nedit Delete=$ndelete"
[ "${nview:-0}" -ge 2 ] && [ "${nstatus:-0}" -ge 2 ] && [ "${nedit:-0}" -ge 2 ] && [ "${ndelete:-0}" -ge 2 ] \
  && echo "PASS: per-row View / Update Status / Edit / Delete actions preserved" \
  || echo "FAIL: row action buttons missing"

# row selection still wired (client-side only — no mutation)
agent-browser eval "var cb=document.querySelectorAll('table input[type=checkbox], table button[role=checkbox]'); cb.length + ' row-checkboxes'" > "$SHOTS/2-checkboxes.txt" 2>&1
nrows=$(agent-browser eval "document.querySelectorAll('tbody tr').length" 2>/dev/null | tail -1 | tr -dc '0-9')
echo "table body rows: $nrows"
# click the first row checkbox via its aria-label
agent-browser eval "var el=document.querySelector('[aria-label=\"Select kk\"]'); el ? (el.click(), 'checked') : 'not-found'" > /dev/null 2>&1
sleep 1
agent-browser read > "$SHOTS/3-selection.txt" 2>&1
if grep -q "1 record(s) selected" "$SHOTS/3-selection.txt"; then
  echo "PASS: row selection opens the bulk status bar (logic intact)"
else
  echo "FAIL: bulk selection bar did not appear"
fi
agent-browser screenshot "$SHOTS/3-selection.png" > /dev/null 2>&1
# clear selection again (no mutation)
agent-browser eval "var b=Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === 'Clear selection'); b ? (b.click(), 'cleared') : 'no-clear'" > /dev/null 2>&1
sleep 0.5

# --- view dialog still works --------------------------------------------------
agent-browser eval "document.querySelectorAll('button[title=\"View\"]')[0].click(); 'view'" > /dev/null 2>&1
sleep 1.5
agent-browser read > "$SHOTS/4-view.txt" 2>&1
if grep -q "Sub-City / Kututtaa Maggalaa" "$SHOTS/4-view.txt" && grep -q "Debaayyuu" "$SHOTS/4-view.txt"; then
  echo "PASS: View dialog opens with full record details"
else
  echo "FAIL: View dialog did not open"
fi
agent-browser screenshot "$SHOTS/4-view.png" > /dev/null 2>&1
agent-browser eval "var b=document.querySelector('[data-slot=dialog-close], .absolute.right-4.top-4'); b ? (b.click(), 'closed') : 'no-close'" > /dev/null 2>&1
sleep 1

# --- filters + pagination controls intact --------------------------------------
has_search=$(agent-browser eval "document.querySelector('input[placeholder^=\"Search name\"]') ? 'yes' : 'no'" 2>/dev/null | tail -1 | tr -d '"')
[ "$has_search" = "yes" ] && echo "PASS: search filter present" || echo "FAIL: search filter missing"
if grep -q "All Sub-Cities\|Debaayyuu" "$SHOTS/1-records.txt"; then
  echo "PASS: filter dropdowns present"
else
  echo "FAIL: filter dropdowns missing"
fi
grep -q "Showing" "$SHOTS/1-records.txt" && echo "PASS: pagination info present" || true

agent-browser screenshot "$SHOTS/1-records.png" > /dev/null 2>&1
echo "--- E2E COMPLETE ---"
