import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { EDUCATION_INSTITUTION_TYPES, EDUCATION_OWNERSHIP_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Education Institution Survey System';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Institution Name / Maqaa Mana Barumsaa', key: 'institutionName', width: 30 },
      { header: 'Institution Type / Gosa Mana Barumsaa', key: 'institutionType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 26 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 22 },
      { header: 'Student Count / Lakkoofsa Barataa', key: 'studentCount', width: 18 },
      { header: 'Teacher Count / Lakkoofsa Barsiisaa', key: 'teacherCount', width: 18 },
      { header: 'Classroom Count', key: 'classroomCount', width: 16 },
      { header: 'Library', key: 'hasLibrary', width: 12 },
      { header: 'Laboratory', key: 'hasLaboratory', width: 12 },
      { header: 'Computer Lab', key: 'hasComputerLab', width: 14 },
      { header: 'Feeding Program', key: 'hasFeedingProgram', width: 14 },
      { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
      { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
    ];

    sheet.columns = columns;

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add example rows
    sheet.addRow({
      institutionName: 'BISHOFTU PRIMARY SCHOOL',
      institutionType: 'Primary School (1-4)',
      ownershipType: 'Government / Public',
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 01',
      specificAddress: 'Near Main Market',
      licenseNumber: 'ED-2024-001',
      studentCount: 850,
      teacherCount: 24,
      classroomCount: 18,
      hasLibrary: 'Yes',
      hasLaboratory: 'No',
      hasComputerLab: 'Yes',
      hasFeedingProgram: 'Yes',
      contactName: 'Ato Getachew Molla',
      contactPhone: '+251911234567',
    });
    sheet.addRow({
      institutionName: 'LUCY PRIVATE KINDERGARTEN',
      institutionType: 'Kindergarten',
      ownershipType: 'Private',
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 02',
      specificAddress: 'Behind Commercial Bank',
      licenseNumber: 'ED-2024-014',
      studentCount: 120,
      teacherCount: 9,
      classroomCount: 6,
      hasLibrary: 'No',
      hasLaboratory: 'No',
      hasComputerLab: 'No',
      hasFeedingProgram: 'Yes',
      contactName: 'W/ro Selamawit Tesfaye',
      contactPhone: '0912345678',
    });

    // Add reference sheets with allowed values
    const typesSheet = workbook.addWorksheet('Institution Types');
    typesSheet.columns = [{ key: 'type', width: 30 }];
    typesSheet.addRow(['Allowed Institution Types']).font = { bold: true };
    EDUCATION_INSTITUTION_TYPES.forEach((t) => typesSheet.addRow([t]));
    typesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const ownersSheet = workbook.addWorksheet('Ownership Types');
    ownersSheet.columns = [{ key: 'type', width: 30 }];
    ownersSheet.addRow(['Allowed Ownership Types']).font = { bold: true };
    EDUCATION_OWNERSHIP_TYPES.forEach((t) => ownersSheet.addRow([t]));
    ownersSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.columns = [{ key: 'note', width: 70 }];
    notesSheet.addRow(['Notes / Yaadannoo']).font = { bold: true };
    notesSheet.addRow(['Yes/No columns accept: Yes, Y, True, 1, Eyee (or No/Lakki)']);
    notesSheet.addRow(['Student Count, Teacher Count and Classroom Count must be whole numbers (0 or more)']);
    notesSheet.addRow(['Contact Phone must be Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX']);
    notesSheet.getColumn(1).font = { size: 10, name: 'Calibri' };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_education_survey_template.xlsx`;

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
