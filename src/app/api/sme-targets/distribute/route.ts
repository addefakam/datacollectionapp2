import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// POST /api/sme-targets/distribute — distribute a parent target to the next
// administrative level (admin):
//   CITY target    → one SUB_CITY target per sub-city
//   SUB_CITY target → one WOREDA target per woreda of that sub-city
// Body: { parentId, items: [{ subCity?, area?, targetValue }] }
// Existing targets for the same scope & period are updated (upsert).
// Scenario: the shares together may leave part of the parent unallocated but
// can never exceed it, and units with a zero share receive no target.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { parentId, items } = body;

    if (!parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty list' }, { status: 400 });
    }

    const parent = await db.smeTarget.findUnique({ where: { id: String(parentId) } });
    if (!parent || parent.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Parent target not found or inactive' }, { status: 404 });
    }
    if (parent.level === 'WOREDA') {
      return NextResponse.json(
        { error: 'Woreda targets cannot be distributed further' },
        { status: 400 }
      );
    }

    const childLevel = parent.level === 'CITY' ? 'SUB_CITY' : 'WOREDA';

    // Parse and validate every share before touching the database.
    const shares: { subCity: string; area: string; value: number }[] = [];
    for (const item of items as { subCity?: unknown; area?: unknown; targetValue?: unknown }[]) {
      const value = Number(item?.targetValue);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        return NextResponse.json(
          { error: 'Each target value must be a whole number (0 or more)' },
          { status: 400 }
        );
      }
      shares.push({
        subCity: String(item?.subCity || '').trim(),
        area: String(item?.area || '').trim(),
        value,
      });
    }

    // The scenario: children share the parent's enterprises — their total
    // may leave part of the parent unallocated, but can never exceed it.
    const requestedTotal = shares.reduce((s, sh) => s + sh.value, 0);
    if (requestedTotal > parent.targetValue) {
      return NextResponse.json(
        {
          error: `Distributed total (${requestedTotal}) exceeds the ${parent.level === 'CITY' ? 'city-wide' : 'sub-city'} target (${parent.targetValue}) — reduce the shares first`,
        },
        { status: 400 }
      );
    }

    const results: { scope: string; targetValue: number }[] = [];

    for (const share of shares) {
      // A zero share means "no target for this unit" — skip it entirely.
      if (share.value === 0) continue;

      if (childLevel === 'SUB_CITY') {
        if (!share.subCity) {
          return NextResponse.json({ error: 'Every item needs a sub-city name' }, { status: 400 });
        }
        const sc = await db.subCity.findUnique({ where: { name: share.subCity } });
        if (!sc) {
          return NextResponse.json({ error: `Unknown sub-city "${share.subCity}"` }, { status: 400 });
        }
      } else {
        if (!share.area) {
          return NextResponse.json({ error: 'Every item needs a woreda name' }, { status: 400 });
        }
        const woreda = await db.subCityArea.findFirst({
          where: { name: share.area, subCity: { name: parent.subCity } },
        });
        if (!woreda) {
          return NextResponse.json(
            { error: `"${share.area}" is not a woreda of "${parent.subCity}"` },
            { status: 400 }
          );
        }
      }

      const childSubCity = childLevel === 'SUB_CITY' ? share.subCity : parent.subCity;
      const childArea = childLevel === 'SUB_CITY' ? '' : share.area;
      const upserted = await db.smeTarget.upsert({
        where: {
          level_subCity_area_periodType_periodStart: {
            level: childLevel,
            subCity: childSubCity,
            area: childArea,
            periodType: parent.periodType,
            periodStart: parent.periodStart,
          },
        },
        update: { targetValue: share.value, status: 'ACTIVE', updatedAt: new Date() },
        create: {
          level: childLevel,
          subCity: childSubCity,
          area: childArea,
          periodType: parent.periodType,
          periodStart: parent.periodStart,
          periodEnd: parent.periodEnd,
          targetValue: share.value,
          note: `Distributed from ${parent.level === 'CITY' ? 'city-wide' : parent.subCity + ' sub-city'} target`,
          createdByName: auth.user.name || auth.user.username || null,
        },
      });

      results.push({
        scope: childLevel === 'SUB_CITY' ? upserted.subCity : `${upserted.area} (${upserted.subCity})`,
        targetValue: upserted.targetValue,
      });
    }

    return NextResponse.json({ distributed: results.length, results }, { status: 201 });
  } catch (error) {
    console.error('Error distributing SME target:', error);
    return NextResponse.json(
      { error: 'Failed to distribute target', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
