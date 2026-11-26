import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { parseSexCounts } from '@/lib/sex-counts';
import { isSmeStatus } from '@/lib/sme';
import { loadSectorSurveyFields } from '@/lib/survey-fields-server';
import { sanitizeCustomAnswers } from '@/lib/survey-fields';

// GET /api/smallenterprises/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const smallEnterprise = await db.smallEnterprise.findUnique({ where: { id } });
    if (!smallEnterprise) {
      return NextResponse.json({ error: 'Small enterprise record not found' }, { status: 404 });
    }
    return NextResponse.json(smallEnterprise);
  } catch (error) {
    console.error('Error fetching small enterprise:', error);
    return NextResponse.json({ error: 'Failed to fetch small enterprise' }, { status: 500 });
  }
}

// PUT /api/smallenterprises/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.smallEnterprise.findUnique({ where: { id } });
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
    if (capital != null && (!Number.isFinite(capital) || capital < 0)) {
      return NextResponse.json({ error: 'Startup capital must be a non-negative number' }, { status: 400 });
    }

    const toBool = (v: unknown) => v === true || v === 'true' || v === 'yes' || v === 1;

    // Establishment status lifecycle: REGISTERED | FULLY_LEGALIZED |
    // AWAITING_OPERATION | OPERATIONAL — stamps statusUpdatedAt + note on change
    let status = existing.status;
    let statusUpdatedAt = existing.statusUpdatedAt;
    let statusNote = existing.statusNote;
    if (body.status !== undefined) {
      if (!isSmeStatus(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Use REGISTERED, FULLY_LEGALIZED, AWAITING_OPERATION or OPERATIONAL' },
          { status: 400 }
        );
      }
      if (body.status !== existing.status) {
        status = body.status;
        statusUpdatedAt = new Date();
        statusNote = body.statusNote ? String(body.statusNote).trim() || null : null;
      } else if (body.statusNote !== undefined) {
        statusNote = body.statusNote ? String(body.statusNote).trim() || null : null;
      }
    } else if (body.statusNote !== undefined) {
      statusNote = body.statusNote ? String(body.statusNote).trim() || null : null;
    }

    // Admin-added custom questionnaire answers — sanitize against the current
    // questionnaire when the edit payload mentions them, otherwise keep stored.
    let customAnswers: Record<string, string> | undefined = undefined;
    if (body.customAnswers !== undefined) {
      const surveyFields = await loadSectorSurveyFields('small-enterprise');
      customAnswers = sanitizeCustomAnswers(surveyFields, body.customAnswers);
      const missingCustom = surveyFields.filter(
        (f) => f.custom && f.enabled && f.required && !customAnswers![f.key]
      );
      if (missingCustom.length > 0) {
        return NextResponse.json(
          {
            error: 'Missing required fields',
            missing: Object.fromEntries(missingCustom.map((f) => [f.key, true])),
          },
          { status: 400 }
        );
      }
    }

    const updated = await db.smallEnterprise.update({
      where: { id },
      data: {
        enterpriseName: body.enterpriseName ?? existing.enterpriseName,
        enterpriseType: body.enterpriseType ?? existing.enterpriseType,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        employeeCount: employees != null && Number.isFinite(employees) ? Math.round(employees) : existing.employeeCount,
        maleEmployees: maleEmployees,
        femaleEmployees: femaleEmployees,
        startupCapital: body.startupCapital !== undefined
          ? (capital != null && Number.isFinite(capital) ? capital : null)
          : existing.startupCapital,
        hasPremises: body.hasPremises != null ? toBool(body.hasPremises) : existing.hasPremises,
        hasTraining: body.hasTraining != null ? toBool(body.hasTraining) : existing.hasTraining,
        status,
        statusUpdatedAt,
        statusNote,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
        customAnswers: body.customAnswers !== undefined
          ? (Object.keys(customAnswers ?? {}).length > 0 ? customAnswers : Prisma.DbNull)
          : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating small enterprise:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/smallenterprises/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const smallEnterprise = await db.smallEnterprise.delete({ where: { id } });
    return NextResponse.json(smallEnterprise);
  } catch (error) {
    console.error('Error deleting small enterprise:', error);
    return NextResponse.json({ error: 'Failed to delete small enterprise record' }, { status: 500 });
  }
}
