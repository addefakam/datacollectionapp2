import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { SECTORS, OWNERSHIP_TYPES } from '@/lib/location-data';

export async function GET() {
  try {
    // Sectors follow the admin-managed list (Administration → Settings → Sectors)
    // — fall back to the registry defaults when the database has none yet.
    let validSectors: string[] = SECTORS;
    try {
      const cats = await db.industryCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      if (cats.length > 0) validSectors = cats.map((c) => c.name);
    } catch {
      // database unavailable — keep the registry defaults
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Industry Survey System';

    const sheet = workbook.addWorksheet('Import Template');

    const columns = [
      { header: 'Establishment Name / Maqaa Indastrii', key: 'establishmentName', width: 30 },
      { header: 'Sector / Goossa Indastrii', key: 'sector', width: 26 },
      { header: 'Sub-City / Kututtaa Maggalaa', key: 'subCity', width: 25 },
      { header: 'Werreda', key: 'area', width: 22 },
      { header: 'Specific Address / Baka Addaa', key: 'specificAddress', width: 30 },
      { header: 'License Number / Lakofsaa Eyyema', key: 'licenseNumber', width: 22 },
      { header: 'Ownership Type / Gosa Abbaa Qabuu', key: 'ownershipType', width: 26 },
      { header: 'EIA / Qorannoo Naannoo', key: 'hasEia', width: 14 },
      { header: 'EIA Date of Approval / Guyyaa Mirkeenya EIA', key: 'eiaApprovalDate', width: 20 },
      { header: 'EMP / Karoora Naannoo', key: 'hasEmp', width: 14 },
      { header: 'EMP Date of Approval / Guyyaa Mirkeenya EMP', key: 'empApprovalDate', width: 20 },
      { header: 'Current Status / Haala Ammaa', key: 'currentStatus', width: 16 },
      { header: 'Employee Count / Lakkoofsa Hojjetaa', key: 'employeeCount', width: 18 },
      { header: 'Male Employees / Dhiira Hojjetaa', key: 'maleEmployees', width: 16 },
      { header: 'Female Employees / Dubartii Hojjetaa', key: 'femaleEmployees', width: 16 },
      { header: 'Startup Capital (ETB) / Qabiyyee Jalqabaa', key: 'startupCapital', width: 20 },
      { header: 'Contact Person / Maqaa Quunnamtii', key: 'contactName', width: 30 },
      { header: 'Contact Phone / Bilbila Quunnamtii', key: 'contactPhone', width: 22 },
    ];

    sheet.columns = columns;

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.height = 36;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    // Add example rows
    sheet.addRow({
      establishmentName: 'BISHOFTU FLOUR FACTORY',
      sector: 'Flour Mill & Grain Processing',
      subCity: 'Bishoftu Central',
      area: 'Bishoftu 01',
      specificAddress: 'Near Industrial Zone',
      licenseNumber: 'IN-2024-001',
      ownershipType: 'Private Limited Company',
      hasEia: 'Yes',
      eiaApprovalDate: '2024-03-15',
      hasEmp: 'Yes',
      empApprovalDate: '2024-04-02',
      currentStatus: 'Active',
      employeeCount: 45,
      maleEmployees: 28,
      femaleEmployees: 17,
      startupCapital: 2500000,
      contactName: 'Abebe Kebede',
      contactPhone: '+251 91 234 5678',
    });
    sheet.addRow({
      establishmentName: 'DUKAM FURNITURE WORKS',
      sector: 'Wood & Furniture',
      subCity: 'Dukam',
      area: 'Odaa Nabee',
      specificAddress: 'Main Road, Beside Garage',
      licenseNumber: '',
      ownershipType: 'Sole Proprietorship',
      hasEia: 'No',
      eiaApprovalDate: '',
      hasEmp: 'No',
      empApprovalDate: '',
      currentStatus: 'Inactive',
      employeeCount: 12,
      maleEmployees: 8,
      femaleEmployees: 4,
      startupCapital: '',
      contactName: 'Hana Tadesse',
      contactPhone: '0912345678',
    });

    // Add instructions sheet
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.getColumn(1).width = 80;
    const instructions = [
      'How to use this template:',
      '',
      '1. Establishment Name is required; all other fields except License Number and Startup Capital are required',
      '2. Sector: use one of the listed sectors (see below)',
      '3. Sub-City: e.g., Dukam or Bishoftu Central (use the sub-cities configured in the app)',
      '4. Werreda: the werreda/area name under the sub-city',
      '5. Specific Address: street name, landmark, or description',
      '6. License Number: optional official license number',
      '7. Ownership Type: one of - ' + OWNERSHIP_TYPES.join(', '),
      '8. EIA: Yes or No — Environmental Impact Assessment done? (Qorannoo Naannoo)',
      '9. EIA Date of Approval: when EIA is Yes — date the EIA was approved, as YYYY-MM-DD (e.g., 2024-03-15); leave empty when EIA is No',
      '10. EMP: Yes or No — Environmental Management Plan prepared? (Karoora Naannoo)',
      '11. EMP Date of Approval: when EMP is Yes — date the EMP was approved, as YYYY-MM-DD; leave empty when EMP is No',
      '12. Current Status: Active or Inactive — is the establishment currently operating? (Haala Ammaa)',
      '13. Employee Count: total number of employees (number)',
      '14. Male Employees: number of male employees — optional; Male + Female must equal Employee Count when filled (Dhiira Hojjetaa)',
      '15. Female Employees: number of female employees — optional; Male + Female must equal Employee Count when filled (Dubartii Hojjetaa)',
      '16. Startup Capital: optional, in ETB (number)',
      '17. Contact Person: full name of the contact person',
      '18. Contact Phone: Ethiopian phone (e.g., +251 91 234 5678 or 0912345678)',
      '',
      'Valid sectors:',
      ...validSectors.map((s, i) => `${i + 1}. ${s}`),
      '',
      'DO NOT change the header row names!',
      'Delete the example rows before importing your data.',
    ];
    instructions.forEach((text, idx) => {
      const cell = instrSheet.getCell(idx + 1, 1);
      cell.value = text;
      if (idx === 0) {
        cell.font = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF0D9488' } };
      } else if (text === 'Valid sectors:') {
        cell.font = { bold: true, size: 12, name: 'Calibri', color: { argb: 'FF0D9488' } };
      } else {
        cell.font = { size: 11, name: 'Calibri' };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="industry_import_template.xlsx"',
      },
    });
  } catch (error) {
    console.error('Template error:', error);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
