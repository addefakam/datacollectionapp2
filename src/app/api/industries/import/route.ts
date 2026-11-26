import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { parseSexCounts } from '@/lib/sex-counts';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Only Excel files (.xlsx, .xls) are accepted' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // ExcelJS's typings expect its own augmented Buffer interface, so cast the Node buffer
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: 'Empty Excel file' }, { status: 400 });
    }

    // Read header row to map column indices
    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (val.includes('establishment') || val.includes('maqaa indastrii') || (val.includes('name') && !val.includes('owner') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.establishmentName = colNumber;
      }
      if (val.includes('sector') || val.includes('goossa indastrii') || val.includes('category')) {
        headers.sector = colNumber;
      }
      if (val.includes('sub-city') || val.includes('subcity') || val.includes('kuttaa')) {
        headers.subCity = colNumber;
      }
      if (val.includes('werreda') || val.includes('woreda') || val.includes('area') || val.includes('kebele')) {
        headers.area = colNumber;
      }
      if (val.includes('address') || val.includes('baka')) {
        headers.specificAddress = colNumber;
      }
      if (val.includes('license no') || val.includes('license number') || val.includes('lakofsaa')) {
        headers.licenseNumber = colNumber;
      }
      if (val.includes('ownership') || val.includes('gosa abbaa')) {
        headers.ownershipType = colNumber;
      }
      // Approval-date and status columns must be matched BEFORE the yes/no
      // headers — "EIA Date of Approval" also contains the word "EIA".
      if (/(^|\W)eia(\W|$)/.test(val) && (val.includes('date') || val.includes('mirkeenya'))) {
        headers.eiaApprovalDate = colNumber;
      }
      if (/(^|\W)emp(\W|$)/.test(val) && (val.includes('date') || val.includes('mirkeenya'))) {
        headers.empApprovalDate = colNumber;
      }
      if (val.includes('status') || val.includes('haala')) {
        headers.currentStatus = colNumber;
      }
      // Word-boundary match so "Employee Count" is not mistaken for EMP
      if (/(^|\W)eia(\W|$)/.test(val) && !val.includes('date') && !val.includes('mirkeenya')) {
        headers.hasEia = colNumber;
      }
      if ((/(^|\W)emp(\W|$)/.test(val) || val.includes('management plan')) && !val.includes('date') && !val.includes('mirkeenya')) {
        headers.hasEmp = colNumber;
      }
      // Sex breakdown columns must be matched before the generic employee
      // column ("Female Employees" also contains "employee", "male").
      if (val.includes('female') || val.includes('dubartii')) {
        headers.femaleEmployees = colNumber;
      } else if (val.includes('male') || val.includes('dhiira')) {
        headers.maleEmployees = colNumber;
      } else if (val.includes('employee') || val.includes('hojjetaa')) {
        headers.employeeCount = colNumber;
      }
      if (val.includes('capital') || val.includes('jalqabaa')) {
        headers.startupCapital = colNumber;
      }
      if (val.includes('contact person') || val.includes('quunnamtii') && !val.includes('bilbila')) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (startupCapital is optional)
    const requiredHeaders = ['establishmentName', 'sector', 'subCity', 'area', 'specificAddress', 'ownershipType', 'employeeCount', 'contactName', 'contactPhone'];
    const missing = requiredHeaders.filter(h => !headers[h]);
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Missing columns in Excel: ${missing.join(', ')}. Download the template first.`,
        missing
      }, { status: 400 });
    }

    const phoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    // Yes/No cell values: Yes, Y, True, 1, Eyee
    const parseYesNo = (v: string) => /^(yes|y|true|1|eyee)$/.test(v.trim().toLowerCase());
    // Status cell values: Active/Sochii → ACTIVE; Inactive/Cufame → INACTIVE; empty → default ACTIVE
    const parseStatus = (v: string) => {
      const s = v.trim().toLowerCase();
      if (/^(inactive|in active|cufame|sochii hin jiru)$/.test(s)) return 'INACTIVE';
      return 'ACTIVE';
    };
    // Date cell values: ExcelJS may give a Date object or a string
    const parseDateCell = (raw: unknown): Date | null => {
      if (raw == null || raw === '') return null;
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
      const d = new Date(String(raw).trim());
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Read data rows (skip header)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const getCell = (col: number) => {
        const cell = row.getCell(col);
        return cell.value ? String(cell.value).trim() : '';
      };

      const establishmentName = getCell(headers.establishmentName!);
      if (!establishmentName) continue; // skip empty rows

      const sector = getCell(headers.sector!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const licenseNumber = headers.licenseNumber ? getCell(headers.licenseNumber) : "";
      const ownershipType = getCell(headers.ownershipType!);
      const hasEia = headers.hasEia ? parseYesNo(getCell(headers.hasEia)) : false;
      const hasEmp = headers.hasEmp ? parseYesNo(getCell(headers.hasEmp)) : false;
      const eiaApprovalDate = headers.eiaApprovalDate ? parseDateCell(row.getCell(headers.eiaApprovalDate).value) : null;
      const empApprovalDate = headers.empApprovalDate ? parseDateCell(row.getCell(headers.empApprovalDate).value) : null;
      const currentStatus = headers.currentStatus ? parseStatus(getCell(headers.currentStatus)) : 'ACTIVE';
      const employeeCount = getCell(headers.employeeCount!);
      const maleEmployees = headers.maleEmployees ? getCell(headers.maleEmployees) : '';
      const femaleEmployees = headers.femaleEmployees ? getCell(headers.femaleEmployees) : '';
      const startupCapital = headers.startupCapital ? getCell(headers.startupCapital) : '';
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!sector || !subCity || !area || !specificAddress || !ownershipType || !employeeCount || !contactName || !contactPhone) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Missing required fields`);
        continue;
      }

      const employees = Number(employeeCount);
      if (!Number.isFinite(employees) || employees < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid employee count "${employeeCount}"`);
        continue;
      }

      const sex = parseSexCounts(maleEmployees, femaleEmployees, employees, 'Employee Count');
      if (!sex.ok) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: ${sex.error}`);
        continue;
      }

      const phoneClean = contactPhone.replace(/[\s-]/g, '');
      if (!phoneRegex.test(phoneClean)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid phone number "${contactPhone}"`);
        continue;
      }

      const capital = startupCapital !== '' ? Number(startupCapital) : null;

      try {
        await db.industry.create({
          data: {
            establishmentName,
            sector,
            subCity,
            area,
            specificAddress,
            licenseNumber: licenseNumber || null,
            ownershipType,
            hasEia,
            hasEmp,
            eiaApprovalDate,
            empApprovalDate,
            currentStatus,
            employeeCount: Math.round(employees),
            maleEmployees: sex.male,
            femaleEmployees: sex.female,
            startupCapital: capital != null && Number.isFinite(capital) ? capital : null,
            contactName,
            contactPhone,
            surveyorName: 'Admin Import',
          },
        });
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Database error`);
      }
    }

    return NextResponse.json({
      message: `Import complete: ${results.success} succeeded, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to process Excel file', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
