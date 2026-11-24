import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { parseSexCounts } from '@/lib/sex-counts';

// POST /api/charities/import — bulk import charity organizations from Excel
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
      if (val.includes('organization name') || (val.includes('name') && !val.includes('contact') && !val.includes('surveyor'))) {
        headers.organizationName = colNumber;
      }
      if (val.includes('organization type') || (val.includes('organization') && !val.includes('name'))) {
        headers.organizationType = colNumber;
      }
      if (val.includes('charity type') || (val.includes('charity') && !val.includes('organization')) || val.includes('gosa')) {
        headers.charityType = colNumber;
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
      if (val.includes('registration no') || val.includes('registration number') || val.includes('license no')) {
        headers.registrationNumber = colNumber;
      }
      // Sex breakdown columns must be matched before the generic beneficiary
      // column ("Female Beneficiaries" also contains "beneficiar", "male").
      if (val.includes('female') || val.includes('dubartii')) {
        headers.femaleBeneficiaries = colNumber;
      } else if (val.includes('male') || val.includes('dhiira')) {
        headers.maleBeneficiaries = colNumber;
      } else if (val.includes('beneficiar') || val.includes('served')) {
        headers.beneficiaryCount = colNumber;
      }
      if (val.includes('volunteer')) {
        headers.volunteerCount = colNumber;
      }
      if (val.includes('budget')) {
        headers.annualBudget = colNumber;
      }
      if (val.includes('registered') && (val.includes('legal') || val.includes('yes/no'))) {
        headers.hasLegalRegistration = colNumber;
      }
      if (val.includes('contact person') || (val.includes('quunnamtii') && !val.includes('bilbila'))) {
        headers.contactName = colNumber;
      }
      if (val.includes('phone') || val.includes('bilbila')) {
        headers.contactPhone = colNumber;
      }
    });

    // Validate required headers (registrationNumber, volunteers, budget, legal registration optional)
    const requiredHeaders = ['organizationName', 'organizationType', 'charityType', 'subCity', 'area', 'specificAddress', 'beneficiaryCount', 'contactName', 'contactPhone'];
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

      const organizationName = getCell(headers.organizationName!);
      if (!organizationName) continue; // skip empty rows

      const organizationType = getCell(headers.organizationType!);
      const charityType = getCell(headers.charityType!);
      const subCity = getCell(headers.subCity!);
      const area = getCell(headers.area!);
      const specificAddress = getCell(headers.specificAddress!);
      const registrationNumber = headers.registrationNumber ? getCell(headers.registrationNumber) : '';
      const beneficiaryCount = getCell(headers.beneficiaryCount!);
      const maleBeneficiaries = headers.maleBeneficiaries ? getCell(headers.maleBeneficiaries) : '';
      const femaleBeneficiaries = headers.femaleBeneficiaries ? getCell(headers.femaleBeneficiaries) : '';
      const volunteerStr = headers.volunteerCount ? getCell(headers.volunteerCount) : '';
      const budgetStr = headers.annualBudget ? getCell(headers.annualBudget) : '';
      const hasLegalRegistration = headers.hasLegalRegistration ? parseYesNo(getCell(headers.hasLegalRegistration)) : false;
      const contactName = getCell(headers.contactName!);
      const contactPhone = getCell(headers.contactPhone!);

      // Validate
      if (!organizationType || !charityType || !subCity || !area || !specificAddress || !beneficiaryCount || !contactName || !contactPhone) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Missing required fields`);
        continue;
      }

      const beneficiaries = Number(beneficiaryCount);
      if (!Number.isFinite(beneficiaries) || beneficiaries < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid beneficiary count "${beneficiaryCount}"`);
        continue;
      }

      const volunteers = volunteerStr !== '' ? Number(volunteerStr) : 0;
      if (!Number.isFinite(volunteers) || volunteers < 0) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid volunteer count "${volunteerStr}"`);
        continue;
      }

      const budget = budgetStr !== '' ? Number(budgetStr.replace(/,/g, '')) : null;
      if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
        results.failed++;
        results.errors.push(`Row ${rowNum}: Invalid annual budget "${budgetStr}"`);
        continue;
      }

      const sex = parseSexCounts(maleBeneficiaries, femaleBeneficiaries, beneficiaries, 'Beneficiary Count');
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
        await db.charityInitiative.create({
          data: {
            organizationName,
            organizationType,
            charityType,
            subCity,
            area,
            specificAddress,
            registrationNumber: registrationNumber || null,
            beneficiaryCount: Math.round(beneficiaries),
            maleBeneficiaries: sex.male,
            femaleBeneficiaries: sex.female,
            volunteerCount: Math.round(volunteers),
            annualBudget: budget,
            hasLegalRegistration,
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
