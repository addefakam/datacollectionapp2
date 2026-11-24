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
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json({ error: 'Empty Excel file' }, { status: 400 });
    }

    // Read header row to map column indices
    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      if (val.includes('enterprise name') || (val.includes('name') && !val.includes('owner') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.enterpriseName = colNumber;
      }
      if (val.includes('enterprise type') || val.includes('type')) {
        headers.enterpriseType = colNumber;
      }
      if (val.includes('ownership') || val.includes('abbaa qabuu')) {
        headers.ownershipType = colNumber;
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
      // Sex breakdown columns must be matched before the generic employee
      // column ("Female Employees" also contains "employee", "male").
      if (val.includes('female') || val.includes('dubartii')) {
        headers.femaleEmployees = colNumber;
      } else if (val.includes('male') || val.includes('dhiira')) {
        headers.maleEmployees = colNumber;
      } else if (val.includes('employee') || val.includes('hojjetaa')) {
        headers.employeeCount = colNumber;
      }
      if (val.includes('capital') || val.includes('qabiyyee maallaqa')) {
        headers.startupCapital = colNumber;
      }
      if (val.includes('premises') || val.includes('workshop')) {
        headers.hasPremises = colNumber;
      }
      if (val.includes('training')) {
        headers.hasTraining = colNumber;
      }
      if (val.includes('contact person') || (val.includes('quunnamtii') && !val.includes('bilbila'))) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (licenseNumber, capital, premises, training optional)
    const requiredHeaders = ['enterpriseName', 'enterpriseType', 'ownershipType', 'subCity', 'area', 'specificAddress', 'employeeCount', 'contactName', 'contactPhone'];
    const missing = requiredHeaders.filter((h) => !headers[h]);
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Missing columns in Excel: ${missing.join(', ')}. Download the template first.`,
        missing,
      }, { status: 400 });
    }

    const phoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    // Yes/No cell values: Yes, Y, True, 1, Eyee
    const parseYesNo = (v: string) => /^(yes|y|true|1|eyee)$/.test(v.trim().toLowerCase());
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Read data rows (skip header)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const getCell = (col: number) => {
        const cell = row.getCell(col);
        return cell.value ? String(cell.value).trim() : '';
      };

      const enterpriseName = getCell(headers.enterpriseName!);
      if (!enterpriseName) continue; // skip empty rows

      const enterpriseType = getCell(headers.enterpriseType!);
      const ownershipType = getCell(headers.ownershipType!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const licenseNumber = headers.licenseNumber ? getCell(headers.licenseNumber) : '';
      const employeeCount = getCell(headers.employeeCount!);
      const maleEmployees = headers.maleEmployees ? getCell(headers.maleEmployees) : '';
      const femaleEmployees = headers.femaleEmployees ? getCell(headers.femaleEmployees) : '';
      const capitalStr = headers.startupCapital ? getCell(headers.startupCapital) : '';
      const hasPremises = headers.hasPremises ? parseYesNo(getCell(headers.hasPremises)) : false;
      const hasTraining = headers.hasTraining ? parseYesNo(getCell(headers.hasTraining)) : false;
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!enterpriseType || !ownershipType || !subCity || !area || !specificAddress || !employeeCount || !contactName || !contactPhone) {
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

      const capital = capitalStr !== '' ? Number(capitalStr.replace(/,/g, '')) : null;
      if (capital != null && (!Number.isFinite(capital) || capital < 0)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid startup capital "${capitalStr}"`);
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

      try {
        await db.smallEnterprise.create({
          data: {
            enterpriseName,
            enterpriseType,
            ownershipType,
            subCity,
            area,
            specificAddress,
            licenseNumber: licenseNumber || null,
            employeeCount: Math.round(employees),
            maleEmployees: sex.male,
            femaleEmployees: sex.female,
            startupCapital: capital,
            hasPremises,
            hasTraining,
            contactName,
            contactPhone,
            surveyorName: 'Admin Import',
          },
        });
        results.success++;
      } catch {
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
