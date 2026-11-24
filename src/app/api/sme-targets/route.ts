import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import {
  isSmePeriodType,
  isSmeTargetLevel,
  smePeriodLabel,
  smePeriodRange,
  SME_TARGET_LEVELS,
} from '@/lib/sme';
import { computeSmeTargetProgress } from '@/lib/sme-server';

export const dynamic = 'force-dynamic';

// GET /api/sme-targets?level=&subCity=&area=&periodType=&ref=
// Lists ACTIVE SME establishment targets with live progress analysis.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const where: Record<string, unknown> = { status: 'ACTIVE' };

    const level = searchParams.get('level');
    if (level && isSmeTargetLevel(level)) where.level = level;
    const subCity = searchParams.get('subCity');
    if (subCity) where.subCity = subCity;
    const area = searchParams.get('area');
    if (area) where.area = area;
    const periodType = searchParams.get('periodType');
    if (periodType && isSmePeriodType(periodType)) where.periodType = periodType;
    // Exact period match when both periodType + ref are given
    const refStr = searchParams.get('ref');
    if (refStr && periodType && isSmePeriodType(periodType)) {
      const ref = new Date(refStr);
      if (!Number.isNaN(ref.getTime())) {
        const { start, end } = smePeriodRange(periodType, ref);
        where.periodStart = start;
        where.periodEnd = end;
      }
    }

    const targets = await db.smeTarget.findMany({
      where,
      orderBy: [
        { periodStart: 'desc' },
        { level: 'asc' },
        { subCity: 'asc' },
        { area: 'asc' },
      ],
    });

    const withProgress = await Promise.all(
      targets.map(async (t) => ({
        ...t,
        periodLabel: smePeriodLabel(
          isSmePeriodType(t.periodType) ? t.periodType : 'yearly',
          t.periodStart,
          t.periodEnd
        ),
        progress: await computeSmeTargetProgress(t),
      }))
    );

    return NextResponse.json({ data: withProgress });
  } catch (error) {
    console.error('Error fetching SME targets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SME targets', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST /api/sme-targets — set a new SME establishment target (admin).
// Body: { level, subCity?, area?, periodType, refDate?, targetValue, note? }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { level, subCity, area, periodType, refDate, targetValue, note } = body;

    if (!isSmeTargetLevel(level)) {
      return NextResponse.json(
        { error: `level must be one of: ${SME_TARGET_LEVELS.join(', ')}` },
        { status: 400 }
      );
    }
    if (!periodType || !isSmePeriodType(periodType)) {
      return NextResponse.json(
        { error: 'periodType must be monthly, quarterly or yearly' },
        { status: 400 }
      );
    }

    const target = Number(targetValue);
    if (!Number.isFinite(target) || target <= 0 || !Number.isInteger(target)) {
      return NextResponse.json(
        { error: 'Target value must be a positive whole number of enterprises' },
        { status: 400 }
      );
    }

    // Validate the administrative scope against the managed locations
    let scopeSubCity = '';
    let scopeArea = '';
    if (level === 'SUB_CITY' || level === 'WOREDA') {
      scopeSubCity = String(subCity || '').trim();
      if (!scopeSubCity) {
        return NextResponse.json({ error: 'Sub-city is required for this target level' }, { status: 400 });
      }
      const sc = await db.subCity.findUnique({ where: { name: scopeSubCity } });
      if (!sc) {
        return NextResponse.json({ error: `Unknown sub-city "${scopeSubCity}"` }, { status: 400 });
      }
    }
    if (level === 'WOREDA') {
      scopeArea = String(area || '').trim();
      if (!scopeArea) {
        return NextResponse.json({ error: 'Woreda (area) is required for woreda targets' }, { status: 400 });
      }
      const woreda = await db.subCityArea.findFirst({
        where: { name: scopeArea, subCity: { name: scopeSubCity } },
      });
      if (!woreda) {
        return NextResponse.json(
          { error: `"${scopeArea}" is not a woreda of "${scopeSubCity}"` },
          { status: 400 }
        );
      }
    }

    const ref = refDate ? new Date(refDate) : new Date();
    if (Number.isNaN(ref.getTime())) {
      return NextResponse.json({ error: 'Invalid refDate' }, { status: 400 });
    }
    const { start, end } = smePeriodRange(periodType, ref);

    // No duplicate ACTIVE target for the same scope & period
    const duplicate = await db.smeTarget.findFirst({
      where: {
        status: 'ACTIVE',
        level,
        subCity: scopeSubCity,
        area: scopeArea,
        periodType,
        periodStart: start,
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'A target for this scope and period already exists — edit it instead' },
        { status: 409 }
      );
    }

    const created = await db.smeTarget.create({
      data: {
        level,
        subCity: scopeSubCity,
        area: scopeArea,
        periodType,
        periodStart: start,
        periodEnd: end,
        targetValue: target,
        note: note ? String(note).trim() || null : null,
        createdByName: auth.user.name || auth.user.username || null,
      },
    });

    return NextResponse.json(
      {
        ...created,
        periodLabel: smePeriodLabel(periodType, created.periodStart, created.periodEnd),
        progress: await computeSmeTargetProgress(created),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating SME target:', error);
    return NextResponse.json(
      { error: 'Failed to create SME target', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
