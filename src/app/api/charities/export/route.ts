import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/charities/export — CSV export of charity (Bussa Goonofa) records
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

    const headers = [
      'Organization Name',
      'Organization Type',
      'Charity Type',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'Registration Number',
      'Beneficiary Count',
      'Male Beneficiaries',
      'Female Beneficiaries',
      'Volunteer Count',
      'Annual Budget (ETB)',
      'Legally Registered',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = charities.map((c) => [
      c.organizationName,
      c.organizationType,
      c.charityType,
      c.subCity,
      c.area,
      c.specificAddress,
      c.registrationNumber || '',
      c.beneficiaryCount,
      c.maleBeneficiaries,
      c.femaleBeneficiaries,
      c.volunteerCount,
      c.annualBudget ?? '',
      c.hasLegalRegistration ? 'Yes' : 'No',
      c.contactName,
      c.contactPhone,
      c.surveyorName || '',
      c.createdAt.toISOString().split('T')[0],
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
        'Content-Disposition': `attachment; filename="dhibayyuu_charity_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting charity data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
