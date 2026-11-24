import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeInstitutionTypes } from '@/lib/location-data';
import { parseSexCounts } from '@/lib/sex-counts';

// GET /api/educationcenters/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const educationCenter = await db.educationCenter.findUnique({ where: { id } });
    if (!educationCenter) {
      return NextResponse.json({ error: 'Education center record not found' }, { status: 404 });
    }
    return NextResponse.json(educationCenter);
  } catch (error) {
    console.error('Error fetching education center:', error);
    return NextResponse.json({ error: 'Failed to fetch education center' }, { status: 500 });
  }
}

// PUT /api/educationcenters/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.educationCenter.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Validate phone if provided
    if (body.contactPhone) {
      const phoneClean = String(body.contactPhone).replace(/[\s-]/g, '');
      const ethPhoneRegex = /^(\+251|251|0)?(9|7)\d{8}$/;
      if (!ethPhoneRegex.test(phoneClean)) {
        return NextResponse.json(
          { error: 'Invalid phone number. Use Ethiopian format: +251 9X XXX XXXX or 09XXXXXXXX' },
          { status: 400 }
        );
      }
    }

    const students = body.studentCount != null ? Number(body.studentCount) : null;
    if (students != null && (!Number.isFinite(students) || students < 0)) {
      return NextResponse.json({ error: 'Student count must be a non-negative number' }, { status: 400 });
    }
    const teachers = body.teacherCount != null ? Number(body.teacherCount) : null;
    if (teachers != null && (!Number.isFinite(teachers) || teachers < 0)) {
      return NextResponse.json({ error: 'Teacher count must be a non-negative number' }, { status: 400 });
    }
    const classrooms = body.classroomCount != null ? Number(body.classroomCount) : null;
    if (classrooms != null && (!Number.isFinite(classrooms) || classrooms < 0)) {
      return NextResponse.json({ error: 'Classroom count must be a non-negative number' }, { status: 400 });
    }

    // Sex breakdowns: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveStudents = students != null && Number.isFinite(students) ? Math.round(students) : existing.studentCount;
    let maleStudents = existing.maleStudents;
    let femaleStudents = existing.femaleStudents;
    if (body.maleStudents !== undefined || body.femaleStudents !== undefined) {
      const sex = parseSexCounts(
        body.maleStudents !== undefined ? body.maleStudents : existing.maleStudents,
        body.femaleStudents !== undefined ? body.femaleStudents : existing.femaleStudents,
        effectiveStudents,
        'Student Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleStudents = sex.male;
      femaleStudents = sex.female;
    }
    const effectiveTeachers = teachers != null && Number.isFinite(teachers) ? Math.round(teachers) : existing.teacherCount;
    let maleTeachers = existing.maleTeachers;
    let femaleTeachers = existing.femaleTeachers;
    if (body.maleTeachers !== undefined || body.femaleTeachers !== undefined) {
      const sex = parseSexCounts(
        body.maleTeachers !== undefined ? body.maleTeachers : existing.maleTeachers,
        body.femaleTeachers !== undefined ? body.femaleTeachers : existing.femaleTeachers,
        effectiveTeachers,
        'Teacher Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleTeachers = sex.male;
      femaleTeachers = sex.female;
    }

    const updated = await db.educationCenter.update({
      where: { id },
      data: {
        institutionName: body.institutionName ?? existing.institutionName,
        institutionType: body.institutionType != null && body.institutionType !== ''
          ? normalizeInstitutionTypes(body.institutionType)
          : existing.institutionType,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        studentCount: students != null && Number.isFinite(students) ? Math.round(students) : existing.studentCount,
        maleStudents: maleStudents,
        femaleStudents: femaleStudents,
        teacherCount: teachers != null && Number.isFinite(teachers) ? Math.round(teachers) : existing.teacherCount,
        maleTeachers: maleTeachers,
        femaleTeachers: femaleTeachers,
        classroomCount: classrooms != null && Number.isFinite(classrooms) ? Math.round(classrooms) : existing.classroomCount,
        hasLibrary: body.hasLibrary != null
          ? (body.hasLibrary === true || body.hasLibrary === 'true' || body.hasLibrary === 'yes' || body.hasLibrary === 1)
          : existing.hasLibrary,
        hasLaboratory: body.hasLaboratory != null
          ? (body.hasLaboratory === true || body.hasLaboratory === 'true' || body.hasLaboratory === 'yes' || body.hasLaboratory === 1)
          : existing.hasLaboratory,
        hasComputerLab: body.hasComputerLab != null
          ? (body.hasComputerLab === true || body.hasComputerLab === 'true' || body.hasComputerLab === 'yes' || body.hasComputerLab === 1)
          : existing.hasComputerLab,
        hasFeedingProgram: body.hasFeedingProgram != null
          ? (body.hasFeedingProgram === true || body.hasFeedingProgram === 'true' || body.hasFeedingProgram === 'yes' || body.hasFeedingProgram === 1)
          : existing.hasFeedingProgram,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating education center:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/educationcenters/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const educationCenter = await db.educationCenter.delete({ where: { id } });
    return NextResponse.json(educationCenter);
  } catch (error) {
    console.error('Error deleting education center:', error);
    return NextResponse.json({ error: 'Failed to delete education center record' }, { status: 500 });
  }
}
