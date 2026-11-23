import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// GET /api/smallenterprises/export/excel — Excel export of small-enterprise records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const enterpriseType = searchParams.get('enterpriseType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (enterpriseType) where.enterpriseType = enterpriseType;

    const smallEnterprises = await db.smallEnterprise.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (smallEnterprises.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dhibayyuu Small Enterprise Survey';

    const sheet = workbook.addWorksheet('Small Enterprises');

    sheet.columns = [
      { header: 'Enterprise Name', key: 'enterpriseName', width: 32 },
      { header: 'Enterprise Type', key: 'enterpriseType', width: 24 },
      { header: 'Ownership Type', key: 'ownershipType', width: 22 },
      { header: 'Sub-City', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address', key: 'specificAddress', width: 30 },
      { header: 'License Number', key: 'licenseNumber', width: 20 },
      { header: 'Employee Count', key: 'employeeCount', width: 16 },
      { header: 'Male Employees', key: 'maleEmployees', width: 16 },
      { header: 'Female Employees', key: 'femaleEmployees', width: 17 },
      { header: 'Startup Capital (ETB)', key: 'startupCapital', width: 20 },
      { header: 'Own Premises', key: 'hasPremises', width: 14 },
      { header: 'MSE Training', key: 'hasTraining', width: 14 },
      { header: 'Contact Person', key: 'contactName', width: 26 },
      { header: 'Contact Phone', key: 'contactPhone', width: 20 },
      { header: 'Surveyor Name', key: 'surveyorName', width: 20 },
      { header: 'Date Collected', key: 'createdAt', width: 15 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    for (const se of smallEnterprises) {
      sheet.addRow({
        enterpriseName: se.enterpriseName,
        enterpriseType: se.enterpriseType,
        ownershipType: se.ownershipType,
        subCity: se.subCity,
        area: se.area,
        specificAddress: se.specificAddress,
        licenseNumber: se.licenseNumber || '',
        employeeCount: se.employeeCount,
        maleEmployees: se.maleEmployees,
        femaleEmployees: se.femaleEmployees,
        startupCapital: se.startupCapital ?? '',
        hasPremises: se.hasPremises ? 'Yes' : 'No',
        hasTraining: se.hasTraining ? 'Yes' : 'No',
        contactName: se.contactName,
        contactPhone: se.contactPhone,
        surveyorName: se.surveyorName || '',
        createdAt: se.createdAt.toISOString().split('T')[0],
      });
    }

    // Auto-filter + freeze header row
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: 17 } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `dhibayyuu_small_enterprise_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting small enterprise Excel:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
