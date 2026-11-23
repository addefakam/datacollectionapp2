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
      if ((val.includes('facility') && !val.includes('type')) || val.includes('maqaa manaa') || (val.includes('name') && !val.includes('owner') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.facilityName = colNumber;
      }
      if (val.includes('facility type') || val.includes('gosa manaa') || (val.includes('type') && !val.includes('ownership'))) {
        headers.facilityType = colNumber;
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
      if (val.includes('staff') || val.includes('hojjetaa')) {
        headers.staffCount = colNumber;
      }
      if (val.includes('bed') || val.includes('siree')) {
        headers.bedCount = colNumber;
      }
      if (/(^|\W)lab(oratory)?(\W|$)/.test(val)) {
        headers.hasLaboratory = colNumber;
      }
      if (/(^|\W)pharmac(y)?(\W|$)/.test(val)) {
        headers.hasPharmacy = colNumber;
      }
      if (/(^|\W)maternit(y)?(\W|$)/.test(val)) {
        headers.hasMaternity = colNumber;
      }
      if (/(^|\W)emergenc(y)?(\W|$)/.test(val) || val.includes('24/7')) {
        headers.hasEmergency = colNumber;
      }
      if (val.includes('contact person') || val.includes('quunnamtii') && !val.includes('bilbila')) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (licenseNumber and bedCount are optional)
    const requiredHeaders = ['facilityName', 'facilityType', 'ownershipType', 'subCity', 'area', 'specificAddress', 'staffCount', 'contactName', 'contactPhone'];
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
    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Read data rows (skip header)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const getCell = (col: number) => {
        const cell = row.getCell(col);
        return cell.value ? String(cell.value).trim() : '';
      };

      const facilityName = getCell(headers.facilityName!);
      if (!facilityName) continue; // skip empty rows

      const facilityType = getCell(headers.facilityType!);
      const ownershipType = getCell(headers.ownershipType!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const licenseNumber = getCell(headers.licenseNumber!);
      const staffCount = getCell(headers.staffCount!);
      const bedCount = headers.bedCount ? getCell(headers.bedCount) : '0';
      const hasLaboratory = headers.hasLaboratory ? parseYesNo(getCell(headers.hasLaboratory)) : false;
      const hasPharmacy = headers.hasPharmacy ? parseYesNo(getCell(headers.hasPharmacy)) : false;
      const hasMaternity = headers.hasMaternity ? parseYesNo(getCell(headers.hasMaternity)) : false;
      const hasEmergency = headers.hasEmergency ? parseYesNo(getCell(headers.hasEmergency)) : false;
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!facilityType || !ownershipType || !subCity || !area || !specificAddress || !staffCount || !contactName || !contactPhone) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Missing required fields`);
        continue;
      }

      const staff = Number(staffCount);
      if (!Number.isFinite(staff) || staff < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid staff count "${staffCount}"`);
        continue;
      }
      const beds = bedCount !== '' ? Number(bedCount) : 0;
      if (!Number.isFinite(beds) || beds < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid bed count "${bedCount}"`);
        continue;
      }

      const phoneClean = contactPhone.replace(/[\s-]/g, '');
      if (!phoneRegex.test(phoneClean)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid phone number "${contactPhone}"`);
        continue;
      }

      try {
        await db.healthCenter.create({
          data: {
            facilityName,
            facilityType,
            ownershipType,
            subCity,
            area,
            specificAddress,
            licenseNumber: licenseNumber || null,
            staffCount: Math.round(staff),
            bedCount: Math.round(beds),
            hasLaboratory,
            hasPharmacy,
            hasMaternity,
            hasEmergency,
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
