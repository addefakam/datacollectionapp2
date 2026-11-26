import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { parseSexCounts } from '@/lib/sex-counts';
import { loadSectorSurveyFields, resolveCustomAnswers } from '@/lib/survey-fields-server';

// GET /api/healthcenters/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const healthCenter = await db.healthCenter.findUnique({ where: { id } });
    if (!healthCenter) {
      return NextResponse.json({ error: 'Health center record not found' }, { status: 404 });
    }
    return NextResponse.json(healthCenter);
  } catch (error) {
    console.error('Error fetching health center:', error);
    return NextResponse.json({ error: 'Failed to fetch health center' }, { status: 500 });
  }
}

// PUT /api/healthcenters/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.healthCenter.findUnique({ where: { id } });
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

    const staff = body.staffCount != null ? Number(body.staffCount) : null;
    if (staff != null && (!Number.isFinite(staff) || staff < 0)) {
      return NextResponse.json({ error: 'Staff count must be a non-negative number' }, { status: 400 });
    }

    // Sex breakdown: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveTotal = staff != null && Number.isFinite(staff) ? Math.round(staff) : existing.staffCount;
    let maleStaff = existing.maleStaff;
    let femaleStaff = existing.femaleStaff;
    if (body.maleStaff !== undefined || body.femaleStaff !== undefined) {
      const sex = parseSexCounts(
        body.maleStaff !== undefined ? body.maleStaff : existing.maleStaff,
        body.femaleStaff !== undefined ? body.femaleStaff : existing.femaleStaff,
        effectiveTotal,
        'Staff Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleStaff = sex.male;
      femaleStaff = sex.female;
    }
    const beds = body.bedCount != null ? Number(body.bedCount) : null;
    if (beds != null && (!Number.isFinite(beds) || beds < 0)) {
      return NextResponse.json({ error: 'Bed count must be a non-negative number' }, { status: 400 });
    }

    // Admin-added custom questionnaire answers — sanitize against the current
    // questionnaire when the edit payload mentions them, otherwise keep stored.
    let customAnswers: Record<string, string> | undefined = undefined;
    if (body.customAnswers !== undefined) {
      const surveyFields = await loadSectorSurveyFields('health');
      const { answers, missing } = resolveCustomAnswers(surveyFields, body.customAnswers);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'Missing required fields',
            missing: Object.fromEntries(missing.map((f) => [f.key, true])),
          },
          { status: 400 }
        );
      }
      customAnswers = answers;
    }

    const updated = await db.healthCenter.update({
      where: { id },
      data: {
        facilityName: body.facilityName ?? existing.facilityName,
        facilityType: body.facilityType ?? existing.facilityType,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        staffCount: staff != null && Number.isFinite(staff) ? Math.round(staff) : existing.staffCount,
        maleStaff: maleStaff,
        femaleStaff: femaleStaff,
        bedCount: beds != null && Number.isFinite(beds) ? Math.round(beds) : existing.bedCount,
        hasLaboratory: body.hasLaboratory != null
          ? (body.hasLaboratory === true || body.hasLaboratory === 'true' || body.hasLaboratory === 'yes' || body.hasLaboratory === 1)
          : existing.hasLaboratory,
        hasPharmacy: body.hasPharmacy != null
          ? (body.hasPharmacy === true || body.hasPharmacy === 'true' || body.hasPharmacy === 'yes' || body.hasPharmacy === 1)
          : existing.hasPharmacy,
        hasMaternity: body.hasMaternity != null
          ? (body.hasMaternity === true || body.hasMaternity === 'true' || body.hasMaternity === 'yes' || body.hasMaternity === 1)
          : existing.hasMaternity,
        hasEmergency: body.hasEmergency != null
          ? (body.hasEmergency === true || body.hasEmergency === 'true' || body.hasEmergency === 'yes' || body.hasEmergency === 1)
          : existing.hasEmergency,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
        customAnswers: body.customAnswers !== undefined
          ? (Object.keys(customAnswers ?? {}).length > 0 ? customAnswers : Prisma.DbNull)
          : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating health center:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/healthcenters/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const healthCenter = await db.healthCenter.delete({ where: { id } });
    return NextResponse.json(healthCenter);
  } catch (error) {
    console.error('Error deleting health center:', error);
    return NextResponse.json({ error: 'Failed to delete health center record' }, { status: 500 });
  }
}
