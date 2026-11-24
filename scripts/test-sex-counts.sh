#!/bin/bash
# End-to-end API test: sex breakdown (male/female) for employees/students/staff/workers
# Modules: Industry, Health, Education, Agriculture
# Validates: POST accept/reject, PUT fallback rules, stats totals, Excel import round-trip.
# Cleanup: all created test records are deleted.
set -e
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
rm -f /tmp/dev.log
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

code=000
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  if [ "$code" = "200" ]; then echo "SERVER READY after ${i}s"; break; fi
  sleep 1
done
if [ "$code" != "200" ]; then echo "SERVER FAILED TO START"; tail -30 /tmp/dev.log; exit 1; fi

J() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(String($1))}catch(e){console.log('PARSE_ERR:'+d.slice(0,300))}})"; }
PASS=0; FAIL=0
chk() { if [ "$1" = "$2" ]; then PASS=$((PASS+1)); echo "  PASS: $3 ($1)"; else FAIL=$((FAIL+1)); echo "  FAIL: $3 — expected [$2] got [$1]"; fi }

# ============ INDUSTRY ============
echo "=== INDUSTRY ==="
# 1. POST valid breakdown
R=$(curl -s -X POST http://localhost:3000/api/industries -H 'Content-Type: application/json' -d '{
  "establishmentName":"ZZSEX Test Factory","sector":"Food Processing","subCity":"Dukam","area":"Odaa Nabee",
  "specificAddress":"Test Area","ownershipType":"Private Limited Company","employeeCount":45,
  "maleEmployees":28,"femaleEmployees":17,"contactName":"Test A","contactPhone":"+251911223344"}')
ID1=$(echo "$R" | J 'o.id'); M1=$(echo "$R" | J 'o.maleEmployees'); F1=$(echo "$R" | J 'o.femaleEmployees')
chk "$M1" "28" "Industry POST stores maleEmployees=28"
chk "$F1" "17" "Industry POST stores femaleEmployees=17"

# 2. POST mismatched breakdown → 400
CODE=$(curl -s -o /tmp/r.json -w "%{http_code}" -X POST http://localhost:3000/api/industries -H 'Content-Type: application/json' -d '{
  "establishmentName":"ZZSEX Bad Factory","sector":"Food Processing","subCity":"Dukam","area":"Odaa Nabee",
  "specificAddress":"Test Area","ownershipType":"Private Limited Company","employeeCount":45,
  "maleEmployees":28,"femaleEmployees":10,"contactName":"Test A","contactPhone":"+251911223344"}')
chk "$CODE" "400" "Industry POST mismatch male+female != total → 400"
ERR=$(J 'o.error' < /tmp/r.json)
echo "    error message: $ERR"

# 3. POST without sex fields (legacy) → 0/0
R=$(curl -s -X POST http://localhost:3000/api/industries -H 'Content-Type: application/json' -d '{
  "establishmentName":"ZZSEX Legacy Factory","sector":"Wood & Furniture","subCity":"Dukam","area":"Odaa Nabee",
  "specificAddress":"Test Area","ownershipType":"Sole Proprietorship","employeeCount":12,
  "contactName":"Test B","contactPhone":"+251911223345"}')
ID2=$(echo "$R" | J 'o.id'); M2=$(echo "$R" | J 'o.maleEmployees'); F2=$(echo "$R" | J 'o.femaleEmployees')
chk "$M2/$F2" "0/0" "Industry POST without sex fields defaults 0/0"

# 4. PUT valid breakdown update
CODE=$(curl -s -o /tmp/r.json -w "%{http_code}" -X PUT http://localhost:3000/api/industries/$ID2 -H 'Content-Type: application/json' \
  -d '{"employeeCount":12,"maleEmployees":7,"femaleEmployees":5}')
chk "$CODE" "200" "Industry PUT valid breakdown"
PUTM=$(J 'o.maleEmployees' < /tmp/r.json); chk "$PUTM" "7" "Industry PUT stores maleEmployees=7"

# 5. PUT mismatched breakdown → 400
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:3000/api/industries/$ID2 -H 'Content-Type: application/json' \
  -d '{"employeeCount":12,"maleEmployees":9,"femaleEmployees":5}')
chk "$CODE" "400" "Industry PUT mismatch → 400"

# 6. stats
S=$(curl -s http://localhost:3000/api/industries/stats)
TM=$(echo "$S" | J 'o.totalMaleEmployees'); TF=$(echo "$S" | J 'o.totalFemaleEmployees')
chk "$TM" "35" "Industry stats totalMaleEmployees = 28+7"
chk "$TF" "22" "Industry stats totalFemaleEmployees = 17+5"

# 7. Excel import round-trip
node -e '
const ExcelJS = require("/home/z/my-project/guesthousedatacollectionapp/node_modules/exceljs");
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Import Template");
  ws.columns = [
    { header: "Establishment Name", key: "n", width: 30 },
    { header: "Sector", key: "s", width: 26 },
    { header: "Sub-City", key: "sc", width: 20 },
    { header: "Werreda", key: "a", width: 20 },
    { header: "Specific Address", key: "ad", width: 20 },
    { header: "Ownership Type", key: "o", width: 20 },
    { header: "EIA", key: "e", width: 10 },
    { header: "EMP", key: "m", width: 10 },
    { header: "Employee Count", key: "c", width: 14 },
    { header: "Male Employees", key: "ma", width: 14 },
    { header: "Female Employees", key: "fe", width: 14 },
    { header: "Contact Person", key: "cp", width: 20 },
    { header: "Contact Phone", key: "ph", width: 20 },
  ];
  ws.addRow({ n: "ZZSEX Import Factory", s: "Food Processing", sc: "Dukam", a: "Odaa Nabee", ad: "Import Row", o: "Private Limited Company", e: "Yes", m: "No", c: 20, ma: 13, fe: 7, cp: "Import Contact", ph: "0912345678" });
  await wb.xlsx.writeFile("/tmp/sex-import-industry.xlsx");
  console.log("xlsx written");
})();'
IMP=$(curl -s -X POST http://localhost:3000/api/industries/import -F "file=@/tmp/sex-import-industry.xlsx")
echo "    import result: $IMP"
SUCC=$(echo "$IMP" | J 'o.success'); chk "$SUCC" "1" "Industry Excel import success=1"
IID=$(curl -s "http://localhost:3000/api/industries?search=ZZSEX%20Import" | J 'o.data[0].id')
IMM=$(curl -s "http://localhost:3000/api/industries/$IID" | J 'o.maleEmployees')
IMF=$(curl -s "http://localhost:3000/api/industries/$IID" | J 'o.femaleEmployees')
chk "$IMM/$IMF" "13/7" "Imported record has male=13 female=7"

# 8. Template has sex columns
curl -s http://localhost:3000/api/industries/import/template -o /tmp/tpl-industry.xlsx
TH=$(node -e '
const ExcelJS = require("/home/z/my-project/guesthousedatacollectionapp/node_modules/exceljs");
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/tmp/tpl-industry.xlsx");
  const headers = [];
  wb.worksheets[0].getRow(1).eachCell(c => headers.push(String(c.value||"")));
  console.log(headers.filter(h => /male/i.test(h)).join(" | "));
})();')
echo "    template sex headers: $TH"
chk "$(echo "$TH" | grep -c 'Male Employees')" "1" "Template has Male Employees column"
chk "$(echo "$TH" | grep -c 'Female Employees')" "1" "Template has Female Employees column"

# 9. cleanup industry
curl -s -X DELETE http://localhost:3000/api/industries/$ID1 > /dev/null
curl -s -X DELETE http://localhost:3000/api/industries/$ID2 > /dev/null
curl -s -X DELETE http://localhost:3000/api/industries/$IID > /dev/null

# ============ HEALTH ============
echo "=== HEALTH ==="
R=$(curl -s -X POST http://localhost:3000/api/healthcenters -H 'Content-Type: application/json' -d '{
  "facilityName":"ZZSEX Test Clinic","facilityType":"Health Center","ownershipType":"Government / Public",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","staffCount":30,
  "maleStaff":18,"femaleStaff":12,"bedCount":5,"contactName":"Test","contactPhone":"+251911223344"}')
HID=$(echo "$R" | J 'o.id'); HM=$(echo "$R" | J 'o.maleStaff'); HF=$(echo "$R" | J 'o.femaleStaff')
chk "$HM/$HF" "18/12" "Health POST stores maleStaff/femaleStaff"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/healthcenters -H 'Content-Type: application/json' -d '{
  "facilityName":"ZZSEX Bad Clinic","facilityType":"Health Center","ownershipType":"Government / Public",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","staffCount":30,
  "maleStaff":18,"femaleStaff":8,"contactName":"Test","contactPhone":"+251911223344"}')
chk "$CODE" "400" "Health POST mismatch → 400"
S=$(curl -s http://localhost:3000/api/healthcenters/stats)
chk "$(echo "$S" | J 'o.totalMaleStaff')" "18" "Health stats totalMaleStaff"
chk "$(echo "$S" | J 'o.totalFemaleStaff')" "12" "Health stats totalFemaleStaff"
curl -s -X DELETE http://localhost:3000/api/healthcenters/$HID > /dev/null

# ============ EDUCATION ============
echo "=== EDUCATION ==="
R=$(curl -s -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName":"ZZSEX Test School","institutionType":"Kindergarten","ownershipType":"Private",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","studentCount":300,
  "maleStudents":160,"femaleStudents":140,"teacherCount":15,"maleTeachers":6,"femaleTeachers":9,
  "classroomCount":10,"contactName":"Test","contactPhone":"+251911223344"}')
EID=$(echo "$R" | J 'o.id')
chk "$(echo "$R" | J 'o.maleStudents')/$(echo "$R" | J 'o.femaleStudents')" "160/140" "Education POST students breakdown"
chk "$(echo "$R" | J 'o.maleTeachers')/$(echo "$R" | J 'o.femaleTeachers')" "6/9" "Education POST teachers breakdown"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName":"ZZSEX Bad School","institutionType":"Kindergarten","ownershipType":"Private",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","studentCount":300,
  "maleStudents":160,"femaleStudents":140,"teacherCount":15,"maleTeachers":6,"femaleTeachers":5,
  "classroomCount":10,"contactName":"Test","contactPhone":"+251911223344"}')
chk "$CODE" "400" "Education POST teacher mismatch → 400"
S=$(curl -s http://localhost:3000/api/educationcenters/stats)
chk "$(echo "$S" | J 'o.totalMaleStudents')" "160" "Education stats totalMaleStudents"
chk "$(echo "$S" | J 'o.totalFemaleStudents')" "140" "Education stats totalFemaleStudents"
chk "$(echo "$S" | J 'o.totalMaleTeachers')" "6" "Education stats totalMaleTeachers"
chk "$(echo "$S" | J 'o.totalFemaleTeachers')" "9" "Education stats totalFemaleTeachers"
curl -s -X DELETE http://localhost:3000/api/educationcenters/$EID > /dev/null

# ============ AGRICULTURE ============
echo "=== AGRICULTURE ==="
R=$(curl -s -X POST http://localhost:3000/api/agriculturecenters -H 'Content-Type: application/json' -d '{
  "farmName":"ZZSEX Test Farm","farmType":"Dairy Farming","ownershipType":"Private",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","landSizeHectares":5,
  "workerCount":15,"maleWorkers":9,"femaleWorkers":6,"contactName":"Test","contactPhone":"+251911223344"}')
AID=$(echo "$R" | J 'o.id')
chk "$(echo "$R" | J 'o.maleWorkers')/$(echo "$R" | J 'o.femaleWorkers')" "9/6" "Agriculture POST workers breakdown"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/agriculturecenters -H 'Content-Type: application/json' -d '{
  "farmName":"ZZSEX Bad Farm","farmType":"Dairy Farming","ownershipType":"Private",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test","landSizeHectares":5,
  "workerCount":15,"maleWorkers":9,"femaleWorkers":3,"contactName":"Test","contactPhone":"+251911223344"}')
chk "$CODE" "400" "Agriculture POST mismatch → 400"
S=$(curl -s http://localhost:3000/api/agriculturecenters/stats)
chk "$(echo "$S" | J 'o.totalMaleWorkers')" "9" "Agriculture stats totalMaleWorkers"
chk "$(echo "$S" | J 'o.totalFemaleWorkers')" "6" "Agriculture stats totalFemaleWorkers"
curl -s -X DELETE http://localhost:3000/api/agriculturecenters/$AID > /dev/null

echo ""
echo "================================"
echo "RESULTS: $PASS passed, $FAIL failed"
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
[ "$FAIL" = "0" ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
