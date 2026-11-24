#!/bin/bash
# Verify: goals API module isolation for bussa-goonofa (authenticated via NextAuth session)
cd /home/z/my-project

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

npm run dev > /tmp/dev-goals.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "== SERVER READY ==" || { echo "SERVER FAILED"; tail -20 /tmp/dev-goals.log; kill $DEV_PID 2>/dev/null; exit 1; }

JAR=/tmp/goal-cookie.jar
rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $JAR -c $JAR -X POST http://localhost:3000/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "csrfToken=$CSRF&username=admin&password=admin123&json=true" > /dev/null

echo "== POST goal for bussa-goonofa (metric=charities) =="
CREATED=$(curl -s -b $JAR -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' \
  -d '{"module":"bussa-goonofa","metric":"charities","periodType":"monthly","refDate":"2026-11-15","targetValue":10,"owner":"Women & Social Affairs"}')
echo "$CREATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'id': d.get('id'), 'module': d.get('module'), 'metric': d.get('metric'), 'progressActual': d.get('progress',{}).get('actual')}))" 2>/dev/null || echo "$CREATED"
GID=$(echo "$CREATED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

echo "== POST cross-module metric (charities under small-enterprise) must 400 =="
curl -s -b $JAR -X POST http://localhost:3000/api/goals -H 'Content-Type: application/json' \
  -d '{"module":"small-enterprise","metric":"charities","periodType":"monthly","targetValue":5}' | head -c 200
echo ""

echo "== GET ?module=bussa-goonofa (expect 1 goal, actual=1 charity) =="
curl -s -b $JAR "http://localhost:3000/api/goals?module=bussa-goonofa" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps([{'metric': g['metric'], 'module': g['module'], 'actual': g['progress']['actual'], 'achievementPct': g['progress']['achievementPct']} for g in d['data']]))"

echo "== GET ?module=small-enterprise (must NOT include the charity goal) =="
curl -s -b $JAR "http://localhost:3000/api/goals?module=small-enterprise" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({'count': len(d['data']), 'metrics': [g['metric'] for g in d['data']]}))"

echo "== cleanup test goal =="
[ -n "$GID" ] && curl -s -b $JAR -X DELETE "http://localhost:3000/api/goals/$GID" | head -c 100
echo ""

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
kill $DEV_PID 2>/dev/null || true
echo DONE
