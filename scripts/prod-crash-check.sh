#!/bin/bash
# Reproduce the preview client-side exception with a production build
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
sleep 1

echo "== BUILD =="
npm run build > /tmp/build.log 2>&1
build_rc=$?
if [ $build_rc -ne 0 ]; then
  echo "BUILD FAILED (rc=$build_rc); last 40 lines:"
  tail -40 /tmp/build.log
  pkill -9 -f "next" 2>/dev/null || true
  exit 1
fi
echo "BUILD OK"
grep -iE "error|warn" /tmp/build.log | grep -v "DeprecationWarning" | head -15 || echo "(no build warnings)"

echo "== START PROD SERVER =="
npx next start -p 3000 > /tmp/prod.log 2>&1 &
code=000
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== PROD SERVER READY ==" || { echo "PROD SERVER FAILED"; tail -20 /tmp/prod.log; pkill -9 -f "next" 2>/dev/null || true; exit 1; }

echo "== OPEN PAGE + CAPTURE CLIENT ERRORS =="
node /home/z/my-project/scripts/crash-check.mjs

echo "== SERVER LOG TAIL =="
tail -15 /tmp/prod.log
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
echo "CRASH CHECK DONE"
