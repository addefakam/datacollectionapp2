import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { SMALL_ENTERPRISE_TYPES, SMALL_ENTERPRISE_OWNERSHIP_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dhibayyuu Small Enterprise Survey';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Enterprise Name', key: 'enterpriseName', width: 32 },
      { header: 'Enterprise Type / Gosa', key: 'enterpriseType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyema', key: 'licenseNumber', width: 22 },
      { header: 'Employee Count / Lakkoofsa Hojjetaa', key: 'employeeCount', width: 18 },
      { header: 'Male Employees / Dhiira', key: 'maleEmployees', width: 16 },
      { header: 'Female Employees / Dubartii', key: 'femaleEmployees', width: 16 },
      { header: 'Startup Capital ETB', key: 'startupCapital', width: 20 },
      { header: 'Own Premises (Yes/No)', key: 'hasPremises', width: 16 },
      { header: 'MSE Training (Yes/No)', key: 'hasTraining', width: 16 },
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
      enterpriseName: 'TIGIST TAILORING WORKSHOP',
      enterpriseType: SMALL_ENTERPRISE_TYPES[0],
      ownershipType: SMALL_ENTERPRISE_OWNERSHIP_TYPES[0],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 01',
      specificAddress: 'Near Central Market',
      licenseNumber: 'MSE-2024-012',
      employeeCount: 9,
      maleEmployees: 3,
      femaleEmployees: 6,
      startupCapital: 85000,
      hasPremises: 'Yes',
      hasTraining: 'Yes',
      contactName: 'Tigist Ayele',
      contactPhone: '+251911234567',
    });
    sheet.addRow({
      enterpriseName: 'DUKAM METAL WORKS PLC',
      enterpriseType: SMALL_ENTERPRISE_TYPES[1],
      ownershipType: SMALL_ENTERPRISE_OWNERSHIP_TYPES[0],
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 02',
      specificAddress: 'Along Dukam Road',
      licenseNumber: 'MSE-2024-031',
      employeeCount: 15,
      maleEmployees: 11,
      femaleEmployees: 4,
      startupCapital: 320000,
      hasPremises: 'Yes',
      hasTraining: 'No',
      contactName: 'Getachew Bekele',
      contactPhone: '0912345678',
    });

    // Add reference sheets with allowed values
    const typesSheet = workbook.addWorksheet('Enterprise Types');
    typesSheet.columns = [{ key: 'type', width: 30 }];
    typesSheet.addRow(['Allowed Enterprise Types']).font = { bold: true };
    SMALL_ENTERPRISE_TYPES.forEach((t) => typesSheet.addRow([t]));
    typesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const ownersSheet = workbook.addWorksheet('Ownership Types');
    ownersSheet.columns = [{ key: 'type', width: 30 }];
    ownersSheet.addRow(['Allowed Ownership Types']).font = { bold: true };
    SMALL_ENTERPRISE_OWNERSHIP_TYPES.forEach((t) => ownersSheet.addRow([t]));
    ownersSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [{ key: 'note', width: 70 }];
    notesSheet.addRow(['Notes / Yaadannoo']).font = { bold: true };
    notesSheet.addRow(['Yes/No columns accept: Yes, Y, True, 1, Eyee (or No/Lakki)']);
    notesSheet.addRow(['Employee Count must be a whole number (0 or more)']);
    notesSheet.addRow(['Male Employees + Female Employees must equal Employee Count when filled (optional columns)']);
    notesSheet.addRow(['Startup Capital is optional — enter a plain number in ETB (no commas)']);
    notesSheet.addRow(['Contact Phone must be Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX']);
    notesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `dhibayyuu_small_enterprise_template.xlsx`;

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
