import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/healthcenters/export — CSV export of health facility records
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

    const headers = [
      'Facility Name',
      'Facility Type',
      'Ownership Type',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'License Number',
      'Staff Count',
      'Bed Count',
      'Laboratory',
      'Pharmacy',
      'Maternity',
      'Emergency (24/7)',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = healthCenters.map((hc) => [
      hc.facilityName,
      hc.facilityType,
      hc.ownershipType,
      hc.subCity,
      hc.area,
      hc.specificAddress,
      hc.licenseNumber || '',
      hc.staffCount,
      hc.bedCount,
      hc.hasLaboratory ? 'Yes' : 'No',
      hc.hasPharmacy ? 'Yes' : 'No',
      hc.hasMaternity ? 'Yes' : 'No',
      hc.hasEmergency ? 'Yes' : 'No',
      hc.contactName,
      hc.contactPhone,
      hc.surveyorName || '',
      hc.createdAt.toISOString().split('T')[0],
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
        'Content-Disposition': `attachment; filename="bishoftu_health_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting health center data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
