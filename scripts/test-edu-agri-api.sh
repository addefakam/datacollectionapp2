#!/bin/bash
# API tests for Education and Agriculture modules
set -e
cd /home/z/my-project/guesthousedatacollectionapp

pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1
npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo 000)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] && echo "SERVER READY" || { echo "SERVER FAILED"; tail -20 /tmp/dev.log; exit 1; }

J() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(String($1))}catch(e){console.log('PARSE_ERR:'+d.slice(0,180))}})"; }

# Admin login
rm -f /tmp/adm.txt
CSRF=$(curl -s -c /tmp/adm.txt http://localhost:3000/api/auth/csrf | J "o.csrfToken")
curl -s -b /tmp/adm.txt -c /tmp/adm.txt -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF" -d "username=admin" -d "password=admin123" -d "json=true" -o /dev/null
echo "ADMIN: $(curl -s -b /tmp/adm.txt http://localhost:3000/api/auth/session | J "o.user?o.user.role:'FAIL'")"

echo "=========== EDUCATION ==========="
echo "--- POST valid"
ED=$(curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{
  "institutionName":"TEST EDU SCHOOL","institutionType":"Primary School (1-4)","ownershipType":"Government / Public",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test Address","licenseNumber":"ED-T-001",
  "studentCount":500,"teacherCount":25,"classroomCount":12,
  "hasLibrary":true,"hasLaboratory":false,"hasComputerLab":true,"hasFeedingProgram":true,
  "contactName":"Test Contact","contactPhone":"0911234567","surveyorName":"Admin","surveyorId":"x1"}')
echo "$ED" | J "'created '+o.institutionName+' id='+o.id"
ED_ID=$(echo "$ED" | J "o.id")

echo "--- POST invalid phone (expect 400)"
curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' \
  -d '{"institutionName":"X","institutionType":"Kindergarten","ownershipType":"Private","subCity":"Dukam","area":"Malkaa","specificAddress":"A","studentCount":1,"teacherCount":1,"classroomCount":1,"contactName":"C","contactPhone":"12345"}' -w " [%{http_code}]\n"

echo "--- POST missing fields (expect 400)"
curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' \
  -d '{"institutionName":"X"}' -w " [%{http_code}]\n" | head -c 220; echo

echo "--- GET list (search TEST)"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/educationcenters?search=TEST" | J "'total='+o.total+' first='+(o.data[0]?o.data[0].institutionName:'none')"

echo "--- GET list filter institutionType"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/educationcenters?institutionType=Kindergarten" | J "'kindergarten total='+o.total"

echo "--- GET stats"
curl -s -b /tmp/adm.txt http://localhost:3000/api/educationcenters/stats | J "'total='+o.total+' students='+o.totalStudents+' teachers='+o.totalTeachers+' classrooms='+o.totalClassrooms+' licensed='+o.withLicense+' buckets:'+Object.keys(o.attributeBuckets).join('/')"

echo "--- PUT update counts"
curl -s -b /tmp/adm.txt -X PUT http://localhost:3000/api/educationcenters/$ED_ID -H 'Content-Type: application/json' \
  -d '{"studentCount":600,"teacherCount":30,"hasLibrary":false}' | J "'updated students='+o.studentCount+' teachers='+o.teacherCount+' library='+o.hasLibrary"

echo "--- CSV export"
curl -s -b /tmp/adm.txt http://localhost:3000/api/educationcenters/export | head -2 | cut -c1-120
echo "--- Excel export + template"
curl -s -b /tmp/adm.txt -o /tmp/edu.xlsx -w "excel:%{http_code} bytes:%{size_download}\n" http://localhost:3000/api/educationcenters/export/excel
curl -s -b /tmp/adm.txt -o /tmp/edu-tpl.xlsx -w "template:%{http_code} bytes:%{size_download}\n" http://localhost:3000/api/educationcenters/import/template

echo "--- Build import xlsx (2 rows, template headers incl. type column) and import"
node -e "
const ExcelJS = require('exceljs');
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Import Template');
ws.columns = [
  { header: 'Institution Name / Maqaa Mana Barumsaa', key: 'institutionName', width: 30 },
  { header: 'Institution Type / Gosa Mana Barumsaa', key: 'institutionType', width: 24 },
  { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
  { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
  { header: 'Werreda', key: 'area', width: 22 },
  { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
  { header: 'License Number', key: 'licenseNumber', width: 22 },
  { header: 'Student Count / Lakkoofsa Barataa', key: 'studentCount', width: 18 },
  { header: 'Teacher Count / Lakkoofsa Barsiisaa', key: 'teacherCount', width: 18 },
  { header: 'Classroom Count', key: 'classroomCount', width: 18 },
  { header: 'Library', key: 'hasLibrary', width: 12 },
  { header: 'Laboratory', key: 'hasLaboratory', width: 12 },
  { header: 'Computer Lab', key: 'hasComputerLab', width: 12 },
  { header: 'Feeding Program', key: 'hasFeedingProgram', width: 14 },
  { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
  { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
];
ws.addRow({ institutionName:'IMPORT EDU ROW A', institutionType:'Secondary School (9-10)', ownershipType:'Government / Public', subCity:'Chelaleka', area:'Erere', specificAddress:'Import Street 1', licenseNumber:'ED-I-1', studentCount:300, teacherCount:15, classroomCount:10, hasLibrary:'Yes', hasLaboratory:'No', hasComputerLab:'Yes', hasFeedingProgram:'No', contactName:'Import Contact A', contactPhone:'0911111111' });
ws.addRow({ institutionName:'IMPORT EDU ROW B', institutionType:'TVET College', ownershipType:'Private', subCity:'Debaayyuu', area:'Dirree', specificAddress:'Import Street 2', licenseNumber:'ED-I-2', studentCount:200, teacherCount:10, classroomCount:8, hasLibrary:'Y', hasLaboratory:'1', hasComputerLab:'Eyee', hasFeedingProgram:'No', contactName:'Import Contact B', contactPhone:'+251922222222' });
wb.xlsx.writeFile('/tmp/edu-import.xlsx').then(()=>console.log('xlsx written'));
"
sleep 1
curl -s -b /tmp/adm.txt -F "file=@/tmp/edu-import.xlsx" http://localhost:3000/api/educationcenters/import | J "o.message+' | errors:'+(o.errors||[]).join('; ')"

echo "--- Verify import mapped NAME column correctly (not the type column)"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/educationcenters?search=IMPORT EDU ROW" | J "(o.data||[]).map(r=>r.institutionName+'/'+r.institutionType+'/'+r.studentCount).join(' | ')"

echo "=========== AGRICULTURE ==========="
echo "--- POST valid (float land)"
AG=$(curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/agriculturecenters -H 'Content-Type: application/json' -d '{
  "farmName":"TEST AGRI FARM","farmType":"Dairy Farming","ownershipType":"Private",
  "subCity":"Dukam","area":"Odaa Nabee","specificAddress":"Test Farm Road","licenseNumber":"AG-T-001",
  "landSizeHectares":12.5,"workerCount":15,
  "hasIrrigation":true,"hasGreenhouse":false,"hasMachinery":true,"hasStorage":true,
  "contactName":"Farm Contact","contactPhone":"+251922345678","surveyorName":"Admin","surveyorId":"x2"}')
echo "$AG" | J "'created '+o.farmName+' land='+o.landSizeHectares+' id='+o.id"
AG_ID=$(echo "$AG" | J "o.id")

echo "--- POST negative land (expect 400)"
curl -s -b /tmp/adm.txt -X POST http://localhost:3000/api/agriculturecenters -H 'Content-Type: application/json' \
  -d '{"farmName":"X","farmType":"Crop Production","ownershipType":"Private","subCity":"Dukam","area":"Malkaa","specificAddress":"A","landSizeHectares":-5,"workerCount":1,"contactName":"C","contactPhone":"0911234567"}' -w " [%{http_code}]\n"

echo "--- PUT land rounding (12.345 -> 12.35)"
curl -s -b /tmp/adm.txt -X PUT http://localhost:3000/api/agriculturecenters/$AG_ID -H 'Content-Type: application/json' \
  -d '{"landSizeHectares":12.345,"workerCount":20}' | J "'land now='+o.landSizeHectares+' workers='+o.workerCount"

echo "--- GET stats"
curl -s -b /tmp/adm.txt http://localhost:3000/api/agriculturecenters/stats | J "'total='+o.total+' workers='+o.totalWorkers+' land='+o.totalLand+' licensed='+o.withLicense+' buckets:'+Object.keys(o.attributeBuckets).join('/')"
echo "--- land bucket rows"
curl -s -b /tmp/adm.txt http://localhost:3000/api/agriculturecenters/stats | J "(o.attributeBuckets.land||[]).map(b=>b.label+':'+b.count).join(', ')"

echo "--- GET list minLand/maxLand filter"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/agriculturecenters?minLand=10&maxLand=20" | J "'10-20ha total='+o.total"

echo "--- CSV export"
curl -s -b /tmp/adm.txt http://localhost:3000/api/agriculturecenters/export | head -2 | cut -c1-120
curl -s -b /tmp/adm.txt -o /tmp/agri.xlsx -w "excel:%{http_code} bytes:%{size_download}\n" http://localhost:3000/api/agriculturecenters/export/excel
curl -s -b /tmp/adm.txt -o /tmp/agri-tpl.xlsx -w "template:%{http_code} bytes:%{size_download}\n" http://localhost:3000/api/agriculturecenters/import/template

echo "--- Build import xlsx and import"
node -e "
const ExcelJS = require('exceljs');
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Import Template');
ws.columns = [
  { header: 'Farm Name / Maqaa Mana Qonnaa', key: 'farmName', width: 30 },
  { header: 'Farm Type / Gosa Qonnaa', key: 'farmType', width: 24 },
  { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
  { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
  { header: 'Werreda', key: 'area', width: 22 },
  { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
  { header: 'License Number', key: 'licenseNumber', width: 22 },
  { header: 'Land Size (ha) / Dachaa', key: 'landSizeHectares', width: 18 },
  { header: 'Worker Count / Lakkoofsa Hojjetaa', key: 'workerCount', width: 18 },
  { header: 'Irrigation', key: 'hasIrrigation', width: 12 },
  { header: 'Greenhouse', key: 'hasGreenhouse', width: 12 },
  { header: 'Machinery', key: 'hasMachinery', width: 12 },
  { header: 'Storage', key: 'hasStorage', width: 12 },
  { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
  { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
];
ws.addRow({ farmName:'IMPORT AGRI ROW A', farmType:'Poultry Farming', ownershipType:'Private', subCity:'Dukam', area:'Xaddachaa', specificAddress:'Agri St 1', licenseNumber:'AG-I-1', landSizeHectares:2.5, workerCount:6, hasIrrigation:'No', hasGreenhouse:'Yes', hasMachinery:'No', hasStorage:'Yes', contactName:'Agri Contact A', contactPhone:'0933333333' });
wb.xlsx.writeFile('/tmp/agri-import.xlsx').then(()=>console.log('xlsx written'));
"
sleep 1
curl -s -b /tmp/adm.txt -F "file=@/tmp/agri-import.xlsx" http://localhost:3000/api/agriculturecenters/import | J "o.message+' | errors:'+(o.errors||[]).join('; ')"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/agriculturecenters?search=IMPORT AGRI ROW" | J "(o.data||[]).map(r=>r.farmName+'/'+r.farmType+'/'+r.landSizeHectares).join(' | ')"

echo "=========== AUTH + CLEANUP ==========="
echo "--- POST without session (expect 401)"
curl -s -X POST http://localhost:3000/api/educationcenters -H 'Content-Type: application/json' -d '{"institutionName":"Nope"}' -w " [%{http_code}]\n"

echo "--- DELETE test records"
curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/educationcenters/$ED_ID | J "'edu deleted:'+(o.id?'yes':'no')"
curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/agriculturecenters/$AG_ID | J "'agri deleted:'+(o.id?'yes':'no')"
for rid in $(curl -s -b /tmp/adm.txt "http://localhost:3000/api/educationcenters?search=IMPORT EDU ROW&limit=50" | J "(o.data||[]).map(r=>r.id).join(' ')"); do curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/educationcenters/$rid -o /dev/null; done
for rid in $(curl -s -b /tmp/adm.txt "http://localhost:3000/api/agriculturecenters?search=IMPORT AGRI ROW&limit=50" | J "(o.data||[]).map(r=>r.id).join(' ')"); do curl -s -b /tmp/adm.txt -X DELETE http://localhost:3000/api/agriculturecenters/$rid -o /dev/null; done
echo "--- FINAL COUNTS (should be 0)"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/educationcenters?limit=1" | J "'edu remaining='+o.total"
curl -s -b /tmp/adm.txt "http://localhost:3000/api/agriculturecenters?limit=1" | J "'agri remaining='+o.total"

kill $DEV_PID 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
echo "API TEST COMPLETE"
