import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// GET /api/educationcenters/export/excel — styled Excel export of education institution records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const institutionType = searchParams.get('institutionType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (institutionType) where.institutionType = institutionType;

    const educationCenters = await db.educationCenter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (educationCenters.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bishoftu Education Survey';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Education Survey');

    const columns: { header: string; key: string; width: number }[] = [
      { header: '#', key: 'row', width: 6 },
      { header: 'Institution Name / Maqaa Mana Barumsaa', key: 'institutionName', width: 32 },
      { header: 'Institution Type / Gosa Mana Barumsaa', key: 'institutionType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 24 },
      { header: 'Sub-City / Kuttaa Maggalaa', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 24 },
      { header: 'Student Count / Lakkoofsa Barataa', key: 'studentCount', width: 14 },
      { header: 'Male Students', key: 'maleStudents', width: 12 },
      { header: 'Female Students', key: 'femaleStudents', width: 12 },
      { header: 'Teacher Count / Lakkoofsa Barsiisaa', key: 'teacherCount', width: 14 },
      { header: 'Male Teachers', key: 'maleTeachers', width: 12 },
      { header: 'Female Teachers', key: 'femaleTeachers', width: 12 },
      { header: 'Classroom Count', key: 'classroomCount', width: 14 },
      { header: 'Library', key: 'hasLibrary', width: 12 },
      { header: 'Laboratory', key: 'hasLaboratory', width: 12 },
      { header: 'Computer Lab', key: 'hasComputerLab', width: 14 },
      { header: 'Feeding Program', key: 'hasFeedingProgram', width: 14 },
      { header: 'Contact Person', key: 'contactName', width: 28 },
      { header: 'Contact Phone', key: 'contactPhone', width: 18 },
      { header: 'Surveyor Name', key: 'surveyorName', width: 20 },
      { header: 'Date Collected', key: 'createdAt', width: 18 },
    ];

    sheet.columns = columns;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add data rows
    educationCenters.forEach((ec, index) => {
      const rowNumber = index + 1;
      const row = sheet.addRow({
        row: rowNumber,
        institutionName: ec.institutionName,
        institutionType: ec.institutionType,
        ownershipType: ec.ownershipType,
        subCity: ec.subCity,
        area: ec.area,
        specificAddress: ec.specificAddress,
        licenseNumber: ec.licenseNumber || '',
        studentCount: ec.studentCount,
        maleStudents: ec.maleStudents,
        femaleStudents: ec.femaleStudents,
        teacherCount: ec.teacherCount,
        maleTeachers: ec.maleTeachers,
        femaleTeachers: ec.femaleTeachers,
        classroomCount: ec.classroomCount,
        hasLibrary: ec.hasLibrary ? 'Yes' : 'No',
        hasLaboratory: ec.hasLaboratory ? 'Yes' : 'No',
        hasComputerLab: ec.hasComputerLab ? 'Yes' : 'No',
        hasFeedingProgram: ec.hasFeedingProgram ? 'Yes' : 'No',
        contactName: ec.contactName,
        contactPhone: ec.contactPhone,
        surveyorName: ec.surveyorName || '',
        createdAt: new Date(ec.createdAt).toLocaleDateString('en-GB'),
      });

      // Alternating row colors
      const isEven = rowNumber % 2 === 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { size: 10, name: 'Calibri' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
        }
      });

      // Center-align the # column
      row.getCell(1).alignment = { horizontal: 'center' };
    });

    // Add summary rows at bottom
    const spacerRow = sheet.addRow({});
    spacerRow.height = 8;

    const totalStudents = educationCenters.reduce((sum, e) => sum + e.studentCount, 0);
    const totalMaleStudents = educationCenters.reduce((sum, e) => sum + e.maleStudents, 0);
    const totalFemaleStudents = educationCenters.reduce((sum, e) => sum + e.femaleStudents, 0);
    const totalTeachers = educationCenters.reduce((sum, e) => sum + e.teacherCount, 0);
    const totalMaleTeachers = educationCenters.reduce((sum, e) => sum + e.maleTeachers, 0);
    const totalFemaleTeachers = educationCenters.reduce((sum, e) => sum + e.femaleTeachers, 0);
    const totalRow = sheet.addRow({
      row: '',
      institutionName: `Total Records: ${educationCenters.length} | Total Students: ${totalStudents} (M ${totalMaleStudents} / F ${totalFemaleStudents}) | Total Teachers: ${totalTeachers} (M ${totalMaleTeachers} / F ${totalFemaleTeachers})`,
    });
    totalRow.getCell(2).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF4338CA' } };

    const dateRow = sheet.addRow({
      row: '',
      institutionName: `Exported on: ${new Date().toLocaleString('en-GB')}`,
    });
    dateRow.getCell(2).font = { italic: true, size: 10, name: 'Calibri', color: { argb: 'FF6B7280' } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_education_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting education center Excel:', error);
    return NextResponse.json({ error: 'Failed to export Excel file' }, { status: 500 });
  }
}
