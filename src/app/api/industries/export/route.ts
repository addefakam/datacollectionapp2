import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/industries/export — CSV export of industry records
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

    const headers = [
      'Establishment Name',
      'Sector',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'License Number',
      'Ownership Type',
      'EIA (Environmental Impact Assessment)',
      'EMP (Environmental Management Plan)',
      'Employee Count',
      'Startup Capital (ETB)',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = industries.map((ind) => [
      ind.establishmentName,
      ind.sector,
      ind.subCity,
      ind.area,
      ind.specificAddress,
      ind.licenseNumber || '',
      ind.ownershipType,
      ind.hasEia ? 'Yes' : 'No',
      ind.hasEmp ? 'Yes' : 'No',
      ind.employeeCount,
      ind.startupCapital != null ? ind.startupCapital : '',
      ind.contactName,
      ind.contactPhone,
      ind.surveyorName || '',
      ind.createdAt.toISOString().split('T')[0],
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
        'Content-Disposition': `attachment; filename="bishoftu_industry_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting industry data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
