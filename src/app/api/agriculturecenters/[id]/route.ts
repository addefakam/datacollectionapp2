import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { parseSexCounts } from '@/lib/sex-counts';
import { loadSectorSurveyFields, resolveCustomAnswers } from '@/lib/survey-fields-server';

// GET /api/agriculturecenters/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agricultureCenter = await db.agricultureCenter.findUnique({ where: { id } });
    if (!agricultureCenter) {
      return NextResponse.json({ error: 'Agriculture center record not found' }, { status: 404 });
    }
    return NextResponse.json(agricultureCenter);
  } catch (error) {
    console.error('Error fetching agriculture center:', error);
    return NextResponse.json({ error: 'Failed to fetch agriculture center' }, { status: 500 });
  }
}

// PUT /api/agriculturecenters/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.agricultureCenter.findUnique({ where: { id } });
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

    const workers = body.workerCount != null ? Number(body.workerCount) : null;
    if (workers != null && (!Number.isFinite(workers) || workers < 0)) {
      return NextResponse.json({ error: 'Worker count must be a non-negative number' }, { status: 400 });
    }

    // Admin-added custom questionnaire answers — sanitize against the current
    // questionnaire when the edit payload mentions them, otherwise keep stored.
    let customAnswers: Record<string, string> | undefined = undefined;
    if (body.customAnswers !== undefined) {
      const surveyFields = await loadSectorSurveyFields('agriculture');
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

    // Sex breakdown: fall back to the stored value per side, then validate
    // against the effective total when the payload mentions either side.
    const effectiveTotal = workers != null && Number.isFinite(workers) ? Math.round(workers) : existing.workerCount;
    let maleWorkers = existing.maleWorkers;
    let femaleWorkers = existing.femaleWorkers;
    if (body.maleWorkers !== undefined || body.femaleWorkers !== undefined) {
      const sex = parseSexCounts(
        body.maleWorkers !== undefined ? body.maleWorkers : existing.maleWorkers,
        body.femaleWorkers !== undefined ? body.femaleWorkers : existing.femaleWorkers,
        effectiveTotal,
        'Worker Count',
      );
      if (!sex.ok) {
        return NextResponse.json({ error: sex.error }, { status: 400 });
      }
      maleWorkers = sex.male;
      femaleWorkers = sex.female;
    }
    const land = body.landSizeHectares != null ? Number(body.landSizeHectares) : null;
    if (land != null && (!Number.isFinite(land) || land < 0)) {
      return NextResponse.json({ error: 'Land size must be a non-negative number' }, { status: 400 });
    }

    const updated = await db.agricultureCenter.update({
      where: { id },
      data: {
        farmName: body.farmName ?? existing.farmName,
        farmType: body.farmType ?? existing.farmType,
        ownershipType: body.ownershipType ?? existing.ownershipType,
        subCity: body.subCity ?? existing.subCity,
        area: body.area ?? existing.area,
        specificAddress: body.specificAddress ?? existing.specificAddress,
        licenseNumber: body.licenseNumber ?? existing.licenseNumber,
        workerCount: workers != null && Number.isFinite(workers) ? Math.round(workers) : existing.workerCount,
        maleWorkers: maleWorkers,
        femaleWorkers: femaleWorkers,
        landSizeHectares: land != null && Number.isFinite(land) ? Math.round(land * 100) / 100 : existing.landSizeHectares,
        hasIrrigation: body.hasIrrigation != null
          ? (body.hasIrrigation === true || body.hasIrrigation === 'true' || body.hasIrrigation === 'yes' || body.hasIrrigation === 1)
          : existing.hasIrrigation,
        hasGreenhouse: body.hasGreenhouse != null
          ? (body.hasGreenhouse === true || body.hasGreenhouse === 'true' || body.hasGreenhouse === 'yes' || body.hasGreenhouse === 1)
          : existing.hasGreenhouse,
        hasMachinery: body.hasMachinery != null
          ? (body.hasMachinery === true || body.hasMachinery === 'true' || body.hasMachinery === 'yes' || body.hasMachinery === 1)
          : existing.hasMachinery,
        hasStorage: body.hasStorage != null
          ? (body.hasStorage === true || body.hasStorage === 'true' || body.hasStorage === 'yes' || body.hasStorage === 1)
          : existing.hasStorage,
        contactName: body.contactName ?? existing.contactName,
        contactPhone: body.contactPhone ?? existing.contactPhone,
        customAnswers: body.customAnswers !== undefined
          ? (Object.keys(customAnswers ?? {}).length > 0 ? customAnswers : Prisma.DbNull)
          : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating agriculture center:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

// DELETE /api/agriculturecenters/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agricultureCenter = await db.agricultureCenter.delete({ where: { id } });
    return NextResponse.json(agricultureCenter);
  } catch (error) {
    console.error('Error deleting agriculture center record:', error);
    return NextResponse.json({ error: 'Failed to delete agriculture center record' }, { status: 500 });
  }
}
