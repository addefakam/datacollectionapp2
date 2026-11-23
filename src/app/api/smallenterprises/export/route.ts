import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/smallenterprises/export — CSV export of small-enterprise records
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

    const headers = [
      'Enterprise Name',
      'Enterprise Type',
      'Ownership Type',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'License Number',
      'Employee Count',
      'Male Employees',
      'Female Employees',
      'Startup Capital (ETB)',
      'Own Premises',
      'MSE Training',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = smallEnterprises.map((se) => [
      se.enterpriseName,
      se.enterpriseType,
      se.ownershipType,
      se.subCity,
      se.area,
      se.specificAddress,
      se.licenseNumber || '',
      se.employeeCount,
      se.maleEmployees,
      se.femaleEmployees,
      se.startupCapital ?? '',
      se.hasPremises ? 'Yes' : 'No',
      se.hasTraining ? 'Yes' : 'No',
      se.contactName,
      se.contactPhone,
      se.surveyorName || '',
      se.createdAt.toISOString().split('T')[0],
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="dhibayyuu_small_enterprise_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting small enterprise data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
