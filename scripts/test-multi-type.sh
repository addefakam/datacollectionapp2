#!/bin/bash
# End-to-end test: multi-select institution type for the Education module
# 1) POST accepts array + messy comma string, normalizes to "A, B"
# 2) GET ?institutionType= matches multi-type records via contains
# 3) stats /types counts each type of a multi-type record individually
# 4) PUT updates types
# Cleanup: all created test records are deleted.
set -e
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
rm -f dev.log
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

code=000
for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo "SERVER READY after ${i}s"; break; fi
  sleep 1
done
if [ "$code" != "200" ]; then echo "SERVER FAILED TO START"; tail -20 /tmp/dev.log; exit 1; fi

J() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(String($1))}catch(e){console.log('PARSE_ERR:'+d.slice(0,200))}})"; }

echo "=== 1. POST with institutionType as ARRAY (like the new form sends) ==="
R1=$(curl -s -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName": "ZZTEST Multi Type Academy",
  "institutionType": ["Kindergarten", "Primary School (1-4)", "Middle School (5-8)"],
  "ownershipType": "Private",
  "subCity": "Bishoftu Central",
  "area": "Bishoftu 01",
  "specificAddress": "Test Address 1",
  "studentCount": 300,
  "teacherCount": 15,
  "classroomCount": 10,
  "contactName": "Test Contact",
  "contactPhone": "+251911223344"
}')
ID1=$(echo "$R1" | J "o.id||''")
echo "created id=$ID1 stored type: $(echo "$R1" | J "o.institutionType")"

echo "=== 2. POST with messy comma STRING (dedupe + trim check) ==="
R2=$(curl -s -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName": "ZZTEST String Normalize School",
  "institutionType": "Primary School (1-4), Kindergarten , Kindergarten, ",
  "ownershipType": "Government / Public",
  "subCity": "Bishoftu Central",
  "area": "Bishoftu 01",
  "specificAddress": "Test Address 2",
  "studentCount": 500,
  "teacherCount": 20,
  "classroomCount": 12,
  "contactName": "Test Contact",
  "contactPhone": "0911223344"
}')
ID2=$(echo "$R2" | J "o.id||''")
echo "created id=$ID2 stored type: $(echo "$R2" | J "o.institutionType")  (expect: Primary School (1-4), Kindergarten)"

echo "=== 3. POST with EMPTY types must fail 400 ==="
EMPTY_CODE=$(curl -s -o /tmp/empty.json -w "%{http_code}" -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName": "ZZTEST No Type", "institutionType": [], "ownershipType": "Private",
  "subCity": "Bishoftu Central", "area": "Bishoftu 01", "specificAddress": "x",
  "contactName": "c", "contactPhone": "0911223344"
}')
echo "empty-type POST status=$EMPTY_CODE (expect 400)"

echo "=== 4. GET filter ?institutionType=Kindergarten — contains-matching finds multi-type records ==="
curl -s "http://localhost:3000/api/educationcenters?institutionType=Kindergarten" | J "'matched='+o.total+' names: '+o.data.map(d=>d.institutionName).join(' | ')"

echo "=== 5. Stats: per-type split (Kindergarten should count BOTH test records) ==="
curl -s http://localhost:3000/api/educationcenters/stats | J "o.types.map(t=>t.institutionType+'='+t.count).join(', ')"

echo "=== 6. PUT record 1 — change types via array ==="
R3=$(curl -s -X PUT "http://localhost:3000/api/educationcenters/$ID1" -H 'Content-Type: application/json' -d '{
  "institutionType": ["Secondary School (9-10)", "TVET College", "Secondary School (9-10)"]
}')
echo "after PUT: $(echo "$R3" | J "o.institutionType")  (expect: Secondary School (9-10), TVET College)"

echo "=== 7. Export still includes joined type ==="
curl -s "http://localhost:3000/api/educationcenters/export" | head -3 | cut -c1-160

echo "=== 8. Cleanup test records ==="
curl -s -X DELETE "http://localhost:3000/api/educationcenters/$ID1" -o /dev/null -w "delete id1: %{http_code}\n"
curl -s -X DELETE "http://localhost:3000/api/educationcenters/$ID2" -o /dev/null -w "delete id2: %{http_code}\n"
LEFT=$(curl -s "http://localhost:3000/api/educationcenters?search=ZZTEST" | J "o.total")
echo "remaining ZZTEST records: $LEFT (expect 0)"

# Kill dev server
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
echo "DONE — server stopped"
