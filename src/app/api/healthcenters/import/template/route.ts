import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { HEALTH_FACILITY_TYPES, HEALTH_OWNERSHIP_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Health Facility Survey System';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Facility Name / Maqaa Manaa Yaalaa', key: 'facilityName', width: 30 },
      { header: 'Facility Type / Gosa Manaa Yaalaa', key: 'facilityType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyema', key: 'licenseNumber', width: 22 },
      { header: 'Staff Count / Lakkoofsa Hojjetaa', key: 'staffCount', width: 18 },
      { header: 'Male Staff / Dhiira Hojjetaa', key: 'maleStaff', width: 16 },
      { header: 'Female Staff / Dubartii Hojjetaa', key: 'femaleStaff', width: 16 },
      { header: 'Bed Count / Lakkoofsa Siree', key: 'bedCount', width: 18 },
      { header: 'Laboratory', key: 'hasLaboratory', width: 12 },
      { header: 'Pharmacy', key: 'hasPharmacy', width: 12 },
      { header: 'Maternity', key: 'hasMaternity', width: 12 },
      { header: 'Emergency (24/7)', key: 'hasEmergency', width: 14 },
      { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
      { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
    ];

    sheet.columns = columns;

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add example rows
    sheet.addRow({
      facilityName: 'BISHOFTU GENERAL HOSPITAL',
      facilityType: HEALTH_FACILITY_TYPES[0],
      ownershipType: HEALTH_OWNERSHIP_TYPES[0],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 01',
      specificAddress: 'Near Main Hospital Road',
      licenseNumber: 'HC-2024-001',
      staffCount: 120,
      maleStaff: 68,
      femaleStaff: 52,
      bedCount: 85,
      hasLaboratory: 'Yes',
      hasPharmacy: 'Yes',
      hasMaternity: 'Yes',
      hasEmergency: 'Yes',
      contactName: 'Dr. Alemayehu Bekele',
      contactPhone: '+251911234567',
    });
    sheet.addRow({
      facilityName: 'FINFINNE PRIVATE CLINIC',
      facilityType: HEALTH_FACILITY_TYPES[2],
      ownershipType: HEALTH_OWNERSHIP_TYPES[1],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 02',
      specificAddress: 'Behind Commercial Bank',
      licenseNumber: 'HC-2024-014',
      staffCount: 8,
      maleStaff: 3,
      femaleStaff: 5,
      bedCount: 0,
      hasLaboratory: 'Yes',
      hasPharmacy: 'Yes',
      hasMaternity: 'No',
      hasEmergency: 'No',
      contactName: 'Sister Hirut Wolde',
      contactPhone: '0912345678',
    });

    // Add reference sheets with allowed values
    const typesSheet = workbook.addWorksheet('Facility Types');
    typesSheet.columns = [{ key: 'type', width: 30 }];
    typesSheet.addRow(['Allowed Facility Types']).font = { bold: true };
    HEALTH_FACILITY_TYPES.forEach((t) => typesSheet.addRow([t]));
    typesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const ownersSheet = workbook.addWorksheet('Ownership Types');
    ownersSheet.columns = [{ key: 'type', width: 30 }];
    ownersSheet.addRow(['Allowed Ownership Types']).font = { bold: true };
    HEALTH_OWNERSHIP_TYPES.forEach((t) => ownersSheet.addRow([t]));
    ownersSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [{ key: 'note', width: 70 }];
    notesSheet.addRow(['Notes / Yaadannoo']).font = { bold: true };
    notesSheet.addRow(['Yes/No columns accept: Yes, Y, True, 1, Eyee (or No/Lakki)']);
    notesSheet.addRow(['Staff Count and Bed Count must be whole numbers (0 or more)']);
    notesSheet.addRow(['Male Staff + Female Staff must equal Staff Count when filled (optional columns)']);
    notesSheet.addRow(['Bed Count = 0 is valid for outpatient-only facilities (clinics, pharmacies)']);
    notesSheet.addRow(['Contact Phone must be Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX']);
    notesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_health_survey_template.xlsx`;

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
