import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/** Accept booleans from JSON, or 'yes'/'true'/1 from offline-synced payloads. */
function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1;
}

// POST /api/educationcenters — create an education institution record
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      institutionName,
      institutionType,
      ownershipType,
      subCity,
      area,
      specificAddress,
      licenseNumber,
      studentCount,
      teacherCount,
      classroomCount,
      hasLibrary,
      hasLaboratory,
      hasComputerLab,
      hasFeedingProgram,
      contactName,
      contactPhone,
      surveyorName,
      surveyorId,
    } = body;

    // Validate required fields
    if (!institutionName || !institutionType || !ownershipType || !subCity || !area || !specificAddress || !contactName || !contactPhone) {
      return NextResponse.json(
        { error: 'Missing required fields', missing: { institutionName: !institutionName, institutionType: !institutionType, ownershipType: !ownershipType, subCity: !subCity, area: !area, specificAddress: !specificAddress, contactName: !contactName, contactPhone: !contactPhone } },
        { status: 400 }
      );
    }

    // Validate student, teacher and classroom counts
    const students = Number(studentCount ?? 0);
    const teachers = Number(teacherCount ?? 0);
    const classrooms = Number(classroomCount ?? 0);
    if (!Number.isFinite(students) || students < 0) {
      return NextResponse.json({ error: 'Student count must be a non-negative number' }, { status: 400 });
    }
    if (!Number.isFinite(teachers) || teachers < 0) {
      return NextResponse.json({ error: 'Teacher count must be a non-negative number' }, { status: 400 });
    }
    if (!Number.isFinite(classrooms) || classrooms < 0) {
      return NextResponse.json({ error: 'Classroom count must be a non-negative number' }, { status: 400 });
    }

    // Validate Ethiopian phone number
    const phoneClean = String(contactPhone).replace(/[\s-]/g, '');
    const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
    if (!ethPhoneRegex.test(phoneClean)) {
      return NextResponse.json(
        { error: 'Invalid phone number. Use Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX' },
        { status: 400 }
      );
    }

    const educationCenter = await db.educationCenter.create({
      data: {
        institutionName,
        institutionType,
        ownershipType,
        subCity,
        area,
        specificAddress: specificAddress || '',
        licenseNumber: licenseNumber || null,
        studentCount: Math.round(students),
        teacherCount: Math.round(teachers),
        classroomCount: Math.round(classrooms),
        hasLibrary: toBool(hasLibrary),
        hasLaboratory: toBool(hasLaboratory),
        hasComputerLab: toBool(hasComputerLab),
        hasFeedingProgram: toBool(hasFeedingProgram),
        contactName,
        contactPhone,
        surveyorName: surveyorName || null,
        surveyorId: surveyorId || null,
      },
    });

    return NextResponse.json(educationCenter, { status: 201 });
  } catch (error) {
    console.error('Error creating education center record:', error);
    return NextResponse.json(
      { error: 'Failed to create education center record', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/educationcenters?subCity=&area=&institutionType=&ownershipType=&search=&minStudents=&maxStudents=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subCity = searchParams.get('subCity');
    const area = searchParams.get('area');
    const institutionType = searchParams.get('institutionType');
    const ownershipType = searchParams.get('ownershipType');
    const search = searchParams.get('search');
    const minStudents = searchParams.get('minStudents');
    const maxStudents = searchParams.get('maxStudents');
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 20;

    const where: Record<string, unknown> = {};

    if (subCity) where.subCity = subCity;
    if (area) where.area = area;
    if (institutionType) where.institutionType = institutionType;
    // Click-through filters for the chart's Ownership / Institution type dimensions
    if (ownershipType) where.ownershipType = ownershipType;
    if (minStudents !== null && minStudents !== '') {
      where.studentCount = { ...(where.studentCount as Record<string, number> | undefined), gte: Number(minStudents) };
    }
    if (maxStudents !== null && maxStudents !== '') {
      where.studentCount = { ...(where.studentCount as Record<string, number> | undefined), lte: Number(maxStudents) };
    }
    if (search) {
      where.OR = [
        { institutionName: { contains: search } },
        { specificAddress: { contains: search } },
        { contactName: { contains: search } },
        { licenseNumber: { contains: search } },
      ];
    }

    const [educationCenters, total] = await Promise.all([
      db.educationCenter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.educationCenter.count({ where }),
    ]);

    return NextResponse.json({
      data: educationCenters,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching education centers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch education centers' },
      { status: 500 }
    );
  }
}
