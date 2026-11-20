import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// GET /api/industries/export/excel — styled Excel export of industry records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const sector = searchParams.get('sector');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (sector) where.sector = sector;

    const industries = await db.industry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (industries.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bishoftu Industry Survey';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Industry Survey');

    const columns: { header: string; key: string; width: number }[] = [
      { header: '#', key: 'row', width: 6 },
      { header: 'Establishment Name / Maqaa Indastrii', key: 'establishmentName', width: 32 },
      { header: 'Sector / Goossa Indastrii', key: 'sector', width: 28 },
      { header: 'Sub-City / Kuttaa Maggalaa', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 24 },
      { header: 'Ownership Type', key: 'ownershipType', width: 24 },
      { header: 'Employees', key: 'employeeCount', width: 12 },
      { header: 'Startup Capital (ETB)', key: 'startupCapital', width: 20 },
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
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add data rows
    industries.forEach((ind, index) => {
      const rowNumber = index + 1;
      const row = sheet.addRow({
        row: rowNumber,
        establishmentName: ind.establishmentName,
        sector: ind.sector,
        subCity: ind.subCity,
        area: ind.area,
        specificAddress: ind.specificAddress,
        licenseNumber: ind.licenseNumber || '',
        ownershipType: ind.ownershipType,
        employeeCount: ind.employeeCount,
        startupCapital: ind.startupCapital != null ? ind.startupCapital : '',
        contactName: ind.contactName,
        contactPhone: ind.contactPhone,
        surveyorName: ind.surveyorName || '',
        createdAt: new Date(ind.createdAt).toLocaleDateString('en-GB'),
      });

      // Alternating row colors
      const isEven = rowNumber % 2 === 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { size: 10, name: 'Calibri' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
        }
      });

      // Center-align the # column
      row.getCell(1).alignment = { horizontal: 'center' };
    });

    // Add summary rows at bottom
    const spacerRow = sheet.addRow({});
    spacerRow.height = 8;

    const totalEmployees = industries.reduce((sum, i) => sum + i.employeeCount, 0);
    const totalRow = sheet.addRow({
      row: '',
      establishmentName: `Total Records: ${industries.length} | Total Employees: ${totalEmployees}`,
    });
    totalRow.getCell(2).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF0F766E' } };

    const dateRow = sheet.addRow({
      row: '',
      establishmentName: `Exported on: ${new Date().toLocaleString('en-GB')}`,
    });
    dateRow.getCell(2).font = { italic: true, size: 10, name: 'Calibri', color: { argb: 'FF6B7280' } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_industry_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting industry Excel:', error);
    return NextResponse.json({ error: 'Failed to export Excel file' }, { status: 500 });
  }
}
