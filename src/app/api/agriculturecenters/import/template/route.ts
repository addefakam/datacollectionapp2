import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { AGRICULTURE_FARM_TYPES, AGRICULTURE_OWNERSHIP_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Agriculture Survey System';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Farm Name / Maqaa Mana Qonnaa', key: 'farmName', width: 30 },
      { header: 'Farm Type / Gosa Qonnaa', key: 'farmType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 22 },
      { header: 'Land Size (ha) / Dachaa', key: 'landSizeHectares', width: 18 },
      { header: 'Worker Count / Lakkoofsa Hojjetaa', key: 'workerCount', width: 18 },
      { header: 'Irrigation', key: 'hasIrrigation', width: 12 },
      { header: 'Greenhouse', key: 'hasGreenhouse', width: 12 },
      { header: 'Machinery', key: 'hasMachinery', width: 12 },
      { header: 'Storage', key: 'hasStorage', width: 12 },
      { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
      { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
    ];

    sheet.columns = columns;

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add example rows
    sheet.addRow({
      farmName: 'ADAA GREEN DAIRY FARM',
      farmType: 'Dairy Farming',
      ownershipType: 'Private',
      subCity: 'Dukam',
      area: 'Odaa Nabee',
      specificAddress: 'Along Debre Zeit Road',
      licenseNumber: 'AG-2024-007',
      landSizeHectares: 12.5,
      workerCount: 15,
      hasIrrigation: 'Yes',
      hasGreenhouse: 'No',
      hasMachinery: 'Yes',
      hasStorage: 'Yes',
      contactName: 'Ato Bekele Ayele',
      contactPhone: '+251911234567',
    });
    sheet.addRow({
      farmName: 'BISHOFTU FARMERS COOPERATIVE',
      farmType: 'Agricultural Cooperative',
      ownershipType: 'Cooperative',
      subCity: 'Chelaleka',
      area: 'Erere',
      specificAddress: 'Near Cooperative Union Office',
      licenseNumber: 'AG-2024-021',
      landSizeHectares: 45,
      workerCount: 30,
      hasIrrigation: 'Yes',
      hasGreenhouse: 'Yes',
      hasMachinery: 'Yes',
      hasStorage: 'Yes',
      contactName: 'W/ro Tsehai Girma',
      contactPhone: '0912345678',
    });

    // Add reference sheets with allowed values
    const typesSheet = workbook.addWorksheet('Farm Types');
    typesSheet.columns = [{ key: 'type', width: 30 }];
    typesSheet.addRow(['Allowed Farm Types']).font = { bold: true };
    AGRICULTURE_FARM_TYPES.forEach((t) => typesSheet.addRow([t]));
    typesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const ownersSheet = workbook.addWorksheet('Ownership Types');
    ownersSheet.columns = [{ key: 'type', width: 30 }];
    ownersSheet.addRow(['Allowed Ownership Types']).font = { bold: true };
    AGRICULTURE_OWNERSHIP_TYPES.forEach((t) => ownersSheet.addRow([t]));
    ownersSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [{ key: 'note', width: 70 }];
    notesSheet.addRow(['Notes / Yaadannoo']).font = { bold: true };
    notesSheet.addRow(['Yes/No columns accept: Yes, Y, True, 1, Eyee (or No/Lakki)']);
    notesSheet.addRow(['Worker Count must be a whole number (0 or more)']);
    notesSheet.addRow(['Land Size is in hectares — decimals allowed, e.g. 12.5']);
    notesSheet.addRow(['Contact Phone must be Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX']);
    notesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_agriculture_survey_template.xlsx`;

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
