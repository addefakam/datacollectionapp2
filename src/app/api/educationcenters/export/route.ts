import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/educationcenters/export — CSV export of education institution records
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const institutionType = searchParams.get('institutionType');

    const where: Record<string, unknown> = {};
    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (institutionType) where.institutionType = institutionType;

    const educationCenters = await db.educationCenter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (educationCenters.length === 0) {
      return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    const headers = [
      'Institution Name',
      'Institution Type',
      'Ownership Type',
      'Sub-City',
      'Werreda',
      'Specific Address',
      'License Number',
      'Student Count',
      'Male Students',
      'Female Students',
      'Teacher Count',
      'Male Teachers',
      'Female Teachers',
      'Classroom Count',
      'Library',
      'Laboratory',
      'Computer Lab',
      'Feeding Program',
      'Contact Person',
      'Contact Phone',
      'Surveyor Name',
      'Date Collected',
    ];

    const rows = educationCenters.map((ec) => [
      ec.institutionName,
      ec.institutionType,
      ec.ownershipType,
      ec.subCity,
      ec.area,
      ec.specificAddress,
      ec.licenseNumber || '',
      ec.studentCount,
      ec.maleStudents,
      ec.femaleStudents,
      ec.teacherCount,
      ec.maleTeachers,
      ec.femaleTeachers,
      ec.classroomCount,
      ec.hasLibrary ? 'Yes' : 'No',
      ec.hasLaboratory ? 'Yes' : 'No',
      ec.hasComputerLab ? 'Yes' : 'No',
      ec.hasFeedingProgram ? 'Yes' : 'No',
      ec.contactName,
      ec.contactPhone,
      ec.surveyorName || '',
      ec.createdAt.toISOString().split('T')[0],
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
        'Content-Disposition': `attachment; filename="bishoftu_education_survey_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting education center data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
