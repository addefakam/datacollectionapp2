import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

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
      if ((val.includes('farm') && !val.includes('type')) || val.includes('maqaa mana qonnaa') || val.includes('establishment') || (val.includes('name') && !val.includes('owner') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.farmName = colNumber;
      }
      if (val.includes('farm type') || val.includes('gosa qonnaa') || (val.includes('type') && !val.includes('ownership'))) {
        headers.farmType = colNumber;
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
      if (val.includes('land') || val.includes('dachaa') || val.includes('hectare')) {
        headers.landSizeHectares = colNumber;
      }
      if (val.includes('worker') || val.includes('hojjetaa')) {
        headers.workerCount = colNumber;
      }
      if (val.includes('irrigation')) {
        headers.hasIrrigation = colNumber;
      }
      if (val.includes('greenhouse')) {
        headers.hasGreenhouse = colNumber;
      }
      if (val.includes('machin')) {
        headers.hasMachinery = colNumber;
      }
      if (val.includes('storage')) {
        headers.hasStorage = colNumber;
      }
      if (val.includes('contact person') || val.includes('quunnamtii') && !val.includes('bilbila')) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (licenseNumber is optional)
    const requiredHeaders = ['farmName', 'farmType', 'ownershipType', 'subCity', 'area', 'specificAddress', 'landSizeHectares', 'workerCount', 'contactName', 'contactPhone'];
    const missing = requiredHeaders.filter(h => !headers[h]);
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Missing columns in Excel: ${missing.join(', ')}. Download the template first.`,
        missing
      }, { status: 400 });
    }

    const phoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    // Yes/No cell values: Yes, Y, True, 1, Eyee
    const parseYesNo = (v: string) => /^(yes|y|true|1|eyee)$/i.test(v.trim());
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Read data rows (skip header)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const getCell = (col: number) => {
        const cell = row.getCell(col);
        return cell.value ? String(cell.value).trim() : '';
      };

      const farmName = getCell(headers.farmName!);
      if (!farmName) continue; // skip empty rows

      const farmType = getCell(headers.farmType!);
      const ownershipType = getCell(headers.ownershipType!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const licenseNumber = getCell(headers.licenseNumber!);
      const landSizeHectares = getCell(headers.landSizeHectares!);
      const workerCount = getCell(headers.workerCount!);
      const hasIrrigation = headers.hasIrrigation ? parseYesNo(getCell(headers.hasIrrigation)) : false;
      const hasGreenhouse = headers.hasGreenhouse ? parseYesNo(getCell(headers.hasGreenhouse)) : false;
      const hasMachinery = headers.hasMachinery ? parseYesNo(getCell(headers.hasMachinery)) : false;
      const hasStorage = headers.hasStorage ? parseYesNo(getCell(headers.hasStorage)) : false;
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!farmType || !ownershipType || !subCity || !area || !specificAddress || !landSizeHectares || !workerCount || !contactName || !contactPhone) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Missing required fields`);
        continue;
      }

      const workers = Number(workerCount);
      if (!Number.isFinite(workers) || workers < 0 || !Number.isInteger(workers)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid worker count "${workerCount}"`);
        continue;
      }
      const land = Number(landSizeHectares);
      if (!Number.isFinite(land) || land < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid land size "${landSizeHectares}"`);
        continue;
      }

      const phoneClean = contactPhone.replace(/[\s-]/g, '');
      if (!phoneRegex.test(phoneClean)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid phone number "${contactPhone}"`);
        continue;
      }

      try {
        await db.agricultureCenter.create({
          data: {
            farmName,
            farmType,
            ownershipType,
            subCity,
            area,
            specificAddress,
            licenseNumber: licenseNumber || null,
            landSizeHectares: Math.round(land * 100) / 100,
            workerCount: Math.round(workers),
            hasIrrigation,
            hasGreenhouse,
            hasMachinery,
            hasStorage,
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
