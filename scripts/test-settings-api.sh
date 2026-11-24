#!/bin/bash
# End-to-end API test for sub-cities and industry categories management
set -e
cd /home/z/my-project/guesthousedatacollectionapp

# 1. Clean port and start dev server
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
rm -f dev.log
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

# Wait for readiness
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo "SERVER READY after ${i}s"; break; fi
  sleep 1
done
if [ "$code" != "200" ]; then echo "SERVER FAILED TO START"; tail -20 /tmp/dev.log; exit 1; fi

J() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(String($1))}catch(e){console.log('PARSE_ERR:'+d.slice(0,200))}})"; }

# 2. Admin login
rm -f /tmp/adm.txt
CSRF=$(curl -s -c /tmp/adm.txt http://localhost:3000/api/auth/csrf | J "o.csrfToken")
curl -s -b /tmp/adm.txt -c /tmp/adm.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF" -d "username=admin" -d "password=admin123" -d "json=true" -o /dev/null
echo "ADMIN SESSION: $(curl -s -b /tmp/adm.txt http://localhost:3000/api/auth/session | J "o.user?o.user.name+':'+o.user.role:'NO SESSION'")"

# 3. GET sub-cities (should be seeded)
echo "--- GET /api/sub-cities"
curl -s -b /tmp/adm.txt http://localhost:3000/api/sub-cities | J "o.subCities.length+' sub-cities; first='+JSON.stringify(o.subCities[0])"
echo "--- GET /api/industry-categories"
curl -s -b /tmp/adm.txt http://localhost:3000/api/industry-categories | J "o.categories.length+' categories: '+o.categories.map(c=>c.name).join(', ')"

# 4. POST new sub-city with areas
echo "--- POST new sub-city 'Test Sub-City'"
NEW_SC=$(curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/sub-cities -H 'Content-Type: application/json' \
  -d '{"name":"Test Sub-City","areas":["Area A","Area B"]}')
echo "$NEW_SC | id=$(echo "$NEW_SC" | J "o.subCity.id")"
SC_ID=$(echo "$NEW_SC" | J "o.subCity.id")

# duplicate check
echo "--- POST duplicate (expect 409)"
curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/sub-cities -H 'Content-Type: application/json' \
  -d '{"name":"Test Sub-City"}' -w " [%{http_code}]\n"

# 5. PUT rename sub-city + update areas
echo "--- PUT rename to 'Renamed Sub-City'"
curl -s -b /tmp/adm.txt -X PUT http://localhost:3000/api/sub-cities/$SC_ID -H 'Content-Type: application/json' \
  -d '{"name":"Renamed Sub-City","areas":["New Area 1","New Area 2","New Area 3"]}' | J "'areas now: '+JSON.stringify(o.subCity.areas)"

# 6. POST new category
echo "--- POST new category 'Test Sector'"
NEW_CAT=$(curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/industry-categories -H 'Content-Type: application/json' \
  -d '{"name":"Test Sector"}')
echo "$NEW_CAT"
CAT_ID=$(echo "$NEW_CAT" | J "o.category.id")

# 7. PUT rename category
echo "--- PUT rename category"
curl -s -b /tmp/adm.txt -X PUT http://localhost:3000/api/industry-categories/$CAT_ID -H 'Content-Type: application/json' \
  -d '{"name":"Renamed Sector"}' | J "'name -> '+o.category.name"

# 8. DELETE both
echo "--- DELETE test sub-city and category"
curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/sub-cities/$SC_ID | J "'sub-city deleted: '+o.success"
curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/industry-categories/$CAT_ID | J "'category deleted: '+o.success"

# 9. Unauthenticated write must fail (401)
echo "--- POST without session (expect 401)"
curl -s -X POST http://localhost:3000/api/industry-categories -H 'Content-Type: application/json' \
  -d '{"name":"Nope"}' -w " [%{http_code}]\n"

# 10. Create a temp collector, then: GET ok, write forbidden (403), cleanup
echo "--- create temp collector via /api/users"
TEMP_USER=$(curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/users -H 'Content-Type: application/json' \
  -d '{"name":"Temp Tester","username":"temp_tester","password":"TempPass123"}')
TU_ID=$(echo "$TEMP_USER" | J "o.user?o.user.id:(o.id||null)")
echo "temp user id: $TU_ID"
rm -f /tmp/col.txt
CSRF2=$(curl -s -c /tmp/col.txt http://localhost:3000/api/auth/csrf | J "o.csrfToken")
COL=$(curl -s -b /tmp/col.txt -c /tmp/col.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF2" -d "username=temp_tester" -d "password=TempPass123" -d "json=true" -w "%{http_code}" -o /tmp/col_resp.txt)
echo "collector login http: $COL"
if [ "$COL" = "200" ] || [ "$COL" = "302" ]; then
  echo "--- collector GET sub-cities (expect 200)"
  curl -s -b /tmp/col.txt -o /dev/null -w "[%{http_code}]\n" http://localhost:3000/api/sub-cities
  echo "--- collector POST category (expect 403)"
  curl -s -b /tmp/col.txt -X POST http://localhost:3000/api/industry-categories -H 'Content-Type: application/json' \
    -d '{"name":"Hacker"}' -w " [%{http_code}]\n"
  echo "--- collector DELETE sub-city (expect 403)"
  curl -s -b /tmp/col.txt -X DELETE http://localhost:3000/api/sub-cities/whatever -w " [%{http_code}]\n"
else
  echo "(collector login failed — response: $(cat /tmp/col_resp.txt | head -c 150))"
fi
if [ -n "$TU_ID" ] && [ "$TU_ID" != "null" ]; then
  curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/users/$TU_ID | J "'temp user deleted'"
fi

# Final state
echo "--- FINAL STATE"
curl -s -b /tmp/adm.txt http://localhost:3000/api/sub-cities | J "o.subCities.map(s=>s.name+'('+s.areas.length+')').join(', ')"
curl -s -b /tmp/adm.txt http://localhost:3000/api/industry-categories | J "o.categories.map(c=>c.name).join(', ')"

kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
echo "TEST COMPLETE"
