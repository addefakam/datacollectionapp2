/**
 * Functional test for the industry bulk-import feature (no DB required).
 *
 * 1. Calls the real template route GET() and saves the generated .xlsx
 * 2. Feeds that template through the real import route POST() with
 *    DATABASE_URL pointed at an unreachable (but protocol-valid) postgres —
 *    rows must parse + pass validation, failing only at the DB write.
 * 3. Feeds a malformed file (bad phone, missing fields, empty rows) through
 *    POST() and checks per-row validation errors.
 */
import { GET as templateGET } from '../src/app/api/industries/import/template/route';
import { POST as importPOST } from '../src/app/api/industries/import/route';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';

// Protocol-valid but unreachable: PrismaClient constructs lazily, queries fail.
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:5432/test';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
};

// ---------- Step 1: template generation ----------
const tRes = await templateGET();
const tBuf = Buffer.from(await tRes.arrayBuffer());
check('template GET returns 200 xlsx', tRes.status === 200 && tBuf.length > 4000, `${tBuf.length} bytes`);
const fname = '/tmp/industry_import_template_test.xlsx';
writeFileSync(fname, tBuf);

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(tBuf);
const sheet = wb.worksheets[0];
const headers: string[] = [];
sheet.getRow(1).eachCell((c) => headers.push(String(c.value)));
console.log('Template headers:', JSON.stringify(headers, null, 0));

// ---------- Step 2: import the pristine template (2 example rows) ----------
const fd = new FormData();
fd.append('file', new File([tBuf], 'industry_import_template_test.xlsx'));
const res = await importPOST(new Request('http://localhost/api/industries/import', { method: 'POST', body: fd }));
const json = await res.json();
console.log('Import result (unreachable DB):', JSON.stringify(json));

check('import route returns 200', res.status === 200);
check('both example rows parsed + validated', json.failed === 2 && json.errors.every((e: string) => e.includes('Database error')),
  `success=${json.success} failed=${json.failed} errors=${JSON.stringify(json.errors)}`);

// ---------- Step 3: malformed data (validation must catch it) ----------
const wb2 = new ExcelJS.Workbook();
const s2 = wb2.addWorksheet('Sheet1');
s2.addRow([
  'Establishment Name / Maqaa Indastrii', 'Sector / Goossa Indastrii', 'Sub-City / Kututtaa Maggalaa',
  'Werreda', 'Specific Address / Baka Addaa', 'License Number / Lakofsaa Eyyema',
  'Ownership Type / Gosa Abbaa Qabuu', 'Employee Count / Lakkoofsa Hojjetaa',
  'Startup Capital (ETB) / Qabiyyee Jalqabaa', 'Contact Person / Maqaa Quunnamtii',
  'Contact Phone / Bilbila Quunnamtii',
]);
s2.addRow(['GOOD PLC', 'Agro-Processing', 'Dukam', 'Odaa Nabee', 'Main Rd', '', 'Government', 10, '', 'Test Person', '0912345678']); // valid
s2.addRow(['BAD PHONE LTD', 'Textile & Garment', 'Dukam', 'Xaddachaa', 'Somewhere', 'LIC-1', 'Cooperative', 5, '', 'Bad Phone', '12345']); // invalid phone
s2.addRow(['MISSING FIELDS', 'Wood & Furniture', 'Dukam', 'Malkaa', '', '', 'Other', '', '', 'Missing Guy', '0912345678']); // missing address+employees
s2.addRow([]); // empty row — must be skipped
const badBuf = Buffer.from(await wb2.xlsx.writeBuffer());
const fd2 = new FormData();
fd2.append('file', new File([badBuf], 'bad.xlsx'));
const res2 = await importPOST(new Request('http://localhost/api/industries/import', { method: 'POST', body: fd2 }));
const json2 = await res2.json();
console.log('Malformed import result:', JSON.stringify(json2, null, 1));

check('valid row reached DB write (Database error, not validation error)', json2.errors.some((e: string) => e.includes('Row 2') && e.includes('Database error')));
check('invalid phone caught at row 3', json2.errors.some((e: string) => e.includes('Row 3') && e.includes('Invalid phone')));
check('missing fields caught at row 4', json2.errors.some((e: string) => e.includes('Row 4') && e.includes('Missing required fields')));
check('empty row skipped (no Row 5 error)', !json2.errors.some((e: string) => e.includes('Row 5')));
check('counts add up', json2.success === 0 && json2.failed === 3);

// ---------- Step 4: wrong file type rejected ----------
const fd3 = new FormData();
fd3.append('file', new File([Buffer.from('not excel')], 'data.csv'));
const res3 = await importPOST(new Request('http://localhost/api/industries/import', { method: 'POST', body: fd3 }));
check('non-Excel file rejected with 400', res3.status === 400);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
