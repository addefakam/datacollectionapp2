import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// GET /api/charities/export/excel — Excel export of charity (Bussa Goonofa) records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const charityType = searchParams.get('charityType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (charityType) where.charityType = charityType;

    const charities = await db.charityInitiative.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (charities.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Dhibayyuu Bussa Goonofa Charity Survey';

    const sheet = workbook.addWorksheet('Charities');

    sheet.columns = [
      { header: 'Organization Name', key: 'organizationName', width: 34 },
      { header: 'Organization Type', key: 'organizationType', width: 24 },
      { header: 'Charity Type', key: 'charityType', width: 28 },
      { header: 'Sub-City', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address', key: 'specificAddress', width: 30 },
      { header: 'Registration Number', key: 'registrationNumber', width: 20 },
      { header: 'Beneficiary Count', key: 'beneficiaryCount', width: 16 },
      { header: 'Male Beneficiaries', key: 'maleBeneficiaries', width: 16 },
      { header: 'Female Beneficiaries', key: 'femaleBeneficiaries', width: 17 },
      { header: 'Volunteer Count', key: 'volunteerCount', width: 15 },
      { header: 'Annual Budget (ETB)', key: 'annualBudget', width: 20 },
      { header: 'Legally Registered', key: 'hasLegalRegistration', width: 16 },
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

    for (const c of charities) {
      sheet.addRow({
        organizationName: c.organizationName,
        organizationType: c.organizationType,
        charityType: c.charityType,
        subCity: c.subCity,
        area: c.area,
        specificAddress: c.specificAddress,
        registrationNumber: c.registrationNumber || '',
        beneficiaryCount: c.beneficiaryCount,
        maleBeneficiaries: c.maleBeneficiaries,
        femaleBeneficiaries: c.femaleBeneficiaries,
        volunteerCount: c.volunteerCount,
        annualBudget: c.annualBudget ?? '',
        hasLegalRegistration: c.hasLegalRegistration ? 'Yes' : 'No',
        contactName: c.contactName,
        contactPhone: c.contactPhone,
        surveyorName: c.surveyorName || '',
        createdAt: c.createdAt.toISOString().split('T')[0],
      });
    }

    // Auto-filter + freeze header row
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: 17 } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `dhibayyuu_charity_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting charity Excel:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
