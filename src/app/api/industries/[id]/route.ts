import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { parseSexCounts } from '@/lib/sex-counts';
import { loadSurveyFields } from '@/lib/industry-survey-server';
import { sanitizeCustomAnswers } from '@/lib/survey-fields';

/** Parse an approval date ('YYYY-MM-DD' from the date input) — null when empty/invalid. */
function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/industries/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const industry = await db.industry.findUnique({ where: { id } });
    if (!industry) {
      return NextResponse.json({ error: 'Industry record not found' }, { status: 404 });
    }
    return NextResponse.json(industry);
  } catch (error) {
    console.error('Error fetching industry:', error);
    return NextResponse.json({ error: 'Failed to fetch industry' }, { status: 500 });
  }
}

// PUT /api/industries/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.industry.findUnique({ where: { id } });
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

    const employees = body.employeeCount != null ? Number(body.employeeCount) : null;
    if (employees != null && (!Number.isFinite(employees) || employees < 0)) {
      return NextResponse.json({ error: 'Employee count must be a non-negative number' }, { status: 400 });
    }

    // Sex breakdown: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveTotal = employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount;
    let maleEmployees = existing.maleEmployees;
    let femaleEmployees = existing.femaleEmployees;
    if (body.maleEmployees !== undefined || body.femaleEmployees !== undefined) {
      const sex = parseSexCounts(
        body.maleEmployees !== undefined ? body.maleEmployees : existing.maleEmployees,
        body.femaleEmployees !== undefined ? body.femaleEmployees : existing.femaleEmployees,
        effectiveTotal,
        'Employee Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleEmployees = sex.male;
      femaleEmployees = sex.female;
    }

    const capital = body.startupCapital != null && body.startupCapital !== '' ? Number(body.startupCapital) : null;

    // Admin-added custom questions (Settings → Survey → Add question) — when
    // the payload mentions them, sanitize against the saved questionnaire and
    // enforce the required ones; otherwise keep the stored answers untouched.
    let customAnswers: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined = undefined;
    if (body.customAnswers !== undefined) {
      const surveyFields = await loadSurveyFields();
      const clean = sanitizeCustomAnswers(surveyFields, body.customAnswers);
      const missingCustom = surveyFields.filter(
        (f) => f.custom && f.enabled && f.required && !clean[f.key]
      );
      if (missingCustom.length > 0) {
        return NextResponse.json(
          { error: `Required question not answered: ${missingCustom[0].labelEn}` },
          { status: 400 }
        );
      }
      customAnswers = Object.keys(clean).length > 0 ? clean : Prisma.DbNull;
    }

    const updated = await db.industry.update({
      where: { id },
      data: {
        establishmentName: body.establishmentName ?? existing.establishmentName,
        sector: body.sector ?? existing.sector,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        hasEia: body.hasEia != null
          ? (body.hasEia === true || body.hasEia === 'true' || body.hasEia === 'yes' || body.hasEia === 1)
          : existing.hasEia,
        hasEmp: body.hasEmp != null
          ? (body.hasEmp === true || body.hasEmp === 'true' || body.hasEmp === 'yes' || body.hasEmp === 1)
          : existing.hasEmp,
        eiaApprovalDate: body.eiaApprovalDate !== undefined ? toDate(body.eiaApprovalDate) : existing.eiaApprovalDate,
        empApprovalDate: body.empApprovalDate !== undefined ? toDate(body.empApprovalDate) : existing.empApprovalDate,
        currentStatus: body.currentStatus === 'INACTIVE' || body.currentStatus === 'ACTIVE'
          ? body.currentStatus
          : existing.currentStatus,
        employeeCount: employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount,
        maleEmployees: maleEmployees,
        femaleEmployees: femaleEmployees,
        startupCapital: capital != null && Number.isFinite(capital) ? capital : existing.startupCapital,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
        ...(body.customAnswers !== undefined ? { customAnswers } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating industry:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/industries/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const industry = await db.industry.delete({ where: { id } });
    return NextResponse.json(industry);
  } catch (error) {
    console.error('Error deleting industry:', error);
    return NextResponse.json({ error: 'Failed to delete industry record' }, { status: 500 });
  }
}
