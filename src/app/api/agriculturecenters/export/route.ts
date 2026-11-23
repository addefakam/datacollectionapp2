import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/agriculturecenters/export — CSV export of farm establishment records
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

    const headers = [
      'Farm Name',
      'Farm Type',
      'Ownership Type',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'License Number',
      'Land Size (ha)',
      'Worker Count',
      'Male Workers',
      'Female Workers',
      'Irrigation',
      'Greenhouse',
      'Machinery',
      'Storage',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = agricultureCenters.map((ac) => [
      ac.farmName,
      ac.farmType,
      ac.ownershipType,
      ac.subCity,
      ac.area,
      ac.specificAddress,
      ac.licenseNumber || '',
      String(ac.landSizeHectares),
      ac.workerCount,
      ac.maleWorkers,
      ac.femaleWorkers,
      ac.hasIrrigation ? 'Yes' : 'No',
      ac.hasGreenhouse ? 'Yes' : 'No',
      ac.hasMachinery ? 'Yes' : 'No',
      ac.hasStorage ? 'Yes' : 'No',
      ac.contactName,
      ac.contactPhone,
      ac.surveyorName || '',
      ac.createdAt.toISOString().split('T')[0],
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
        'Content-Disposition': `attachment; filename="bishoftu_agriculture_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting agriculture center data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
