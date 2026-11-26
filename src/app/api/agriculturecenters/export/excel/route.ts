import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { loadSectorSurveyFields } from '@/lib/survey-fields-server';
import type { SurveyFieldConfig } from '@/lib/survey-fields';

// GET /api/agriculturecenters/export/excel — styled Excel export of farm establishment records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const farmType = searchParams.get('farmType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (farmType) where.farmType = farmType;

    const agricultureCenters = await db.agricultureCenter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (agricultureCenters.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bishoftu Agriculture Survey';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Agriculture Survey');

    // Admin-added custom questionnaire questions become extra columns
    const customQs = (await loadSectorSurveyFields('agriculture')).filter(
      (f: SurveyFieldConfig) => f.custom && f.enabled
    );

    const columns: { header: string; key: string; width: number }[] = [
      { header: '#', key: 'row', width: 6 },
      { header: 'Farm Name / Maqaa Mana Qonnaa', key: 'farmName', width: 32 },
      { header: 'Farm Type / Gosa Qonnaa', key: 'farmType', width: 24 },
      { header: 'Ownership / Abbaa Qabuu', key: 'ownershipType', width: 24 },
      { header: 'Sub-City / Kuttaa Maggalaa', key: 'subCity', width: 22 },
      { header: 'Werreda', key: 'area', width: 20 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyeema', key: 'licenseNumber', width: 24 },
      { header: 'Land Size (ha) / Dachaa', key: 'landSizeHectares', width: 14 },
      { header: 'Worker Count / Lakkoofsa Hojjetaa', key: 'workerCount', width: 12 },
      { header: 'Male Workers', key: 'maleWorkers', width: 12 },
      { header: 'Female Workers', key: 'femaleWorkers', width: 12 },
      { header: 'Irrigation', key: 'hasIrrigation', width: 12 },
      { header: 'Greenhouse', key: 'hasGreenhouse', width: 12 },
      { header: 'Machinery', key: 'hasMachinery', width: 12 },
      { header: 'Storage', key: 'hasStorage', width: 12 },
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
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add data rows
    agricultureCenters.forEach((ac, index) => {
      const rowNumber = index + 1;
      const row = sheet.addRow({
        row: rowNumber,
        farmName: ac.farmName,
        farmType: ac.farmType,
        ownershipType: ac.ownershipType,
        subCity: ac.subCity,
        area: ac.area,
        specificAddress: ac.specificAddress,
        licenseNumber: ac.licenseNumber || '',
        landSizeHectares: ac.landSizeHectares,
        workerCount: ac.workerCount,
        maleWorkers: ac.maleWorkers,
        femaleWorkers: ac.femaleWorkers,
        hasIrrigation: ac.hasIrrigation ? 'Yes' : 'No',
        hasGreenhouse: ac.hasGreenhouse ? 'Yes' : 'No',
        hasMachinery: ac.hasMachinery ? 'Yes' : 'No',
        hasStorage: ac.hasStorage ? 'Yes' : 'No',
        contactName: ac.contactName,
        contactPhone: ac.contactPhone,
        surveyorName: ac.surveyorName || '',
        createdAt: new Date(ac.createdAt).toLocaleDateString('en-GB'),
        ...Object.fromEntries(
          customQs.map((f) => {
            const ca = (ac.customAnswers ?? {}) as Record<string, unknown>;
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
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        }
      });

      // Center-align the # column
      row.getCell(1).alignment = { horizontal: 'center' };
    });

    // Add summary rows at bottom
    const spacerRow = sheet.addRow({});
    spacerRow.height = 8;

    const totalWorkers = agricultureCenters.reduce((sum, a) => sum + a.workerCount, 0);
    const totalMaleWorkers = agricultureCenters.reduce((sum, a) => sum + a.maleWorkers, 0);
    const totalFemaleWorkers = agricultureCenters.reduce((sum, a) => sum + a.femaleWorkers, 0);
    const totalLand = agricultureCenters.reduce((sum, a) => sum + a.landSizeHectares, 0);
    const totalRow = sheet.addRow({
      row: '',
      farmName: `Total Records: ${agricultureCenters.length} | Total Workers: ${totalWorkers} (M ${totalMaleWorkers} / F ${totalFemaleWorkers}) | Total Land: ${Math.round(totalLand * 10) / 10} ha`,
    });
    totalRow.getCell(2).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF047857' } };

    const dateRow = sheet.addRow({
      row: '',
      farmName: `Exported on: ${new Date().toLocaleString('en-GB')}`,
    });
    dateRow.getCell(2).font = { italic: true, size: 10, name: 'Calibri', color: { argb: 'FF6B7280' } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `bishoftu_agriculture_survey_${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting agriculture center Excel:', error);
    return NextResponse.json({ error: 'Failed to export Excel file' }, { status: 500 });
  }
}
