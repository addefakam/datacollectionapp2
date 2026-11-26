import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { loadSectorSurveyFields } from '@/lib/survey-fields-server';
import type { SurveyFieldConfig } from '@/lib/survey-fields';

// GET /api/healthcenters/export/excel — styled Excel export of health facility records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const facilityType = searchParams.get('facilityType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (facilityType) where.facilityType = facilityType;

    const healthCenters = await db.healthCenter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (healthCenters.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bishoftu Health Survey';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Health Survey');

    // Admin-added custom questionnaire questions become extra columns
    const customQs = (await loadSectorSurveyFields('health')).filter(
      (f: SurveyFieldConfig) => f.custom && f.enabled
    );

    const columns: { header: string; key: string; width: number }[] = [
      { header: '#', key: 'row', width: 6 },
      { header: 'Facility Name / Maqaa Manaa Yaalaa', key: 'facilityName', width: 32 },
      { header: 'Facility Type / Gosa Manaa Yaalaa', key: 'facilityType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 24 },
      { header: 'Sub-City / Kuttaa Maggalaa', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 24 },
      { header: 'Staff Count / Hojjetaa', key: 'staffCount', width: 12 },
      { header: 'Male Staff', key: 'maleStaff', width: 12 },
      { header: 'Female Staff', key: 'femaleStaff', width: 12 },
      { header: 'Bed Count / Siree', key: 'bedCount', width: 12 },
      { header: 'Laboratory', key: 'hasLaboratory', width: 12 },
      { header: 'Pharmacy', key: 'hasPharmacy', width: 12 },
      { header: 'Maternity', key: 'hasMaternity', width: 12 },
      { header: 'Emergency (24/7)', key: 'hasEmergency', width: 14 },
      { header: 'Contact Person', key: 'contactName', width: 28 },
      { header: 'Contact Phone', key: 'contactPhone', width: 18 },
      { header: 'Surveyor Name', key: 'surveyorName', width: 20 },
      { header: 'Date Collected', key: 'createdAt', width: 18 },
      ...customQs.map((f) => ({ header: f.labelEn, key: f.key, width: 22 })),
    ];

    sheet.columns = columns;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add data rows
    healthCenters.forEach((hc, index) => {
      const rowNumber = index + 1;
      const row = sheet.addRow({
        row: rowNumber,
        facilityName: hc.facilityName,
        facilityType: hc.facilityType,
        ownershipType: hc.ownershipType,
        subCity: hc.subCity,
        area: hc.area,
        specificAddress: hc.specificAddress,
        licenseNumber: hc.licenseNumber || '',
        staffCount: hc.staffCount,
        maleStaff: hc.maleStaff,
        femaleStaff: hc.femaleStaff,
        bedCount: hc.bedCount,
        hasLaboratory: hc.hasLaboratory ? 'Yes' : 'No',
        hasPharmacy: hc.hasPharmacy ? 'Yes' : 'No',
        hasMaternity: hc.hasMaternity ? 'Yes' : 'No',
        hasEmergency: hc.hasEmergency ? 'Yes' : 'No',
        contactName: hc.contactName,
        contactPhone: hc.contactPhone,
        surveyorName: hc.surveyorName || '',
        createdAt: new Date(hc.createdAt).toLocaleDateString('en-GB'),
        ...Object.fromEntries(
          customQs.map((f) => {
            const ca = (hc.customAnswers ?? {}) as Record<string, unknown>;
            return [f.key, ca[f.key] != null ? String(ca[f.key]) : ''];
          })
        ),
      });

      // Alternating row colors
      const isEven = rowNumber % 2 === 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { size: 10, name: 'Calibri' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
        }
      });

      // Center-align the # column
      row.getCell(1).alignment = { horizontal: 'center' };
    });

    // Add summary rows at bottom
    const spacerRow = sheet.addRow({});
    spacerRow.height = 8;

    const totalStaff = healthCenters.reduce((sum, h) => sum + h.staffCount, 0);
    const totalMaleStaff = healthCenters.reduce((sum, h) => sum + h.maleStaff, 0);
    const totalFemaleStaff = healthCenters.reduce((sum, h) => sum + h.femaleStaff, 0);
    const totalBeds = healthCenters.reduce((sum, h) => sum + h.bedCount, 0);
    const totalRow = sheet.addRow({
      row: '',
      facilityName: `Total Records: ${healthCenters.length} | Total Staff: ${totalStaff} (M ${totalMaleStaff} / F ${totalFemaleStaff}) | Total Beds: ${totalBeds}`,
    });
    totalRow.getCell(2).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF0369A1' } };

    const dateRow = sheet.addRow({
      row: '',
      facilityName: `Exported on: ${new Date().toLocaleString('en-GB')}`,
    });
    dateRow.getCell(2).font = { italic: true, size: 10, name: 'Calibri', color: { argb: 'FF6B7280' } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_health_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting health center Excel:', error);
    return NextResponse.json({ error: 'Failed to export Excel file' }, { status: 500 });
  }
}
