import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { CHARITY_TYPES, CHARITY_ORGANIZATION_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dhibayyuu Bussa Goonofa Charity Survey';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Organization Name', key: 'organizationName', width: 34 },
      { header: 'Organization Type', key: 'organizationType', width: 26 },
      { header: 'Charity Type / Gosa', key: 'charityType', width: 28 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'Registration Number', key: 'registrationNumber', width: 22 },
      { header: 'Beneficiary Count / Daddachaa', key: 'beneficiaryCount', width: 18 },
      { header: 'Male Beneficiaries / Dhiira', key: 'maleBeneficiaries', width: 16 },
      { header: 'Female Beneficiaries / Dubartii', key: 'femaleBeneficiaries', width: 16 },
      { header: 'Volunteer Count', key: 'volunteerCount', width: 15 },
      { header: 'Annual Budget ETB', key: 'annualBudget', width: 18 },
      { header: 'Legally Registered (Yes/No)', key: 'hasLegalRegistration', width: 16 },
      { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
      { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
    ];

    sheet.columns = columns;

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add example rows
    sheet.addRow({
      organizationName: 'HOPE ORPHAN SUPPORT CENTER',
      organizationType: CHARITY_ORGANIZATION_TYPES[0],
      charityType: CHARITY_TYPES[0],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 01',
      specificAddress: 'Near Central Market',
      registrationNumber: 'REG-2024-045',
      beneficiaryCount: 120,
      maleBeneficiaries: 55,
      femaleBeneficiaries: 65,
      volunteerCount: 18,
      annualBudget: 450000,
      hasLegalRegistration: 'Yes',
      contactName: 'Abebe Tolera',
      contactPhone: '+251911234567',
    });
    sheet.addRow({
      organizationName: 'Saint Mary Church Iddir',
      organizationType: CHARITY_ORGANIZATION_TYPES[3],
      charityType: CHARITY_TYPES[3],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 02',
      specificAddress: 'Along Dukam Road',
      registrationNumber: '',
      beneficiaryCount: 60,
      maleBeneficiaries: 25,
      femaleBeneficiaries: 35,
      volunteerCount: 10,
      annualBudget: 80000,
      hasLegalRegistration: 'No',
      contactName: 'Getachew Bekele',
      contactPhone: '0912345678',
    });

    // Add reference sheets with allowed values
    const typesSheet = workbook.addWorksheet('Charity Types');
    typesSheet.columns = [{ key: 'type', width: 36 }];
    typesSheet.addRow(['Allowed Charity Types']).font = { bold: true };
    CHARITY_TYPES.forEach((t) => typesSheet.addRow([t]));
    typesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const orgsSheet = workbook.addWorksheet('Organization Types');
    orgsSheet.columns = [{ key: 'type', width: 30 }];
    orgsSheet.addRow(['Allowed Organization Types']).font = { bold: true };
    CHARITY_ORGANIZATION_TYPES.forEach((t) => orgsSheet.addRow([t]));
    orgsSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [{ key: 'note', width: 70 }];
    notesSheet.addRow(['Notes / Yaadannoo']).font = { bold: true };
    notesSheet.addRow(['Yes/No columns accept: Yes, Y, True, 1, Eyee (or No/Lakki)']);
    notesSheet.addRow(['Beneficiary Count must be a whole number (0 or more)']);
    notesSheet.addRow(['Male Beneficiaries + Female Beneficiaries must equal Beneficiary Count when filled (optional columns)']);
    notesSheet.addRow(['Volunteer Count and Annual Budget are optional — enter plain numbers (no commas)']);
    notesSheet.addRow(['Contact Phone must be Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX']);
    notesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `dhibayyuu_charity_template.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Template generation error:', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
