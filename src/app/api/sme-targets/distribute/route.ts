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
    const results: { scope: string; targetValue: number }[] = [];

    for (const item of items) {
      const value = Number(item?.targetValue);
      if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        return NextResponse.json(
          { error: 'Each target value must be a whole number (0 or more)' },
          { status: 400 }
        );
      }

      let childSubCity = '';
      let childArea = '';

      if (childLevel === 'SUB_CITY') {
        childSubCity = String(item?.subCity || '').trim();
        if (!childSubCity) {
          return NextResponse.json({ error: 'Every item needs a sub-city name' }, { status: 400 });
        }
        const sc = await db.subCity.findUnique({ where: { name: childSubCity } });
        if (!sc) {
          return NextResponse.json({ error: `Unknown sub-city "${childSubCity}"` }, { status: 400 });
        }
      } else {
        childSubCity = parent.subCity;
        childArea = String(item?.area || '').trim();
        if (!childArea) {
          return NextResponse.json({ error: 'Every item needs a woreda name' }, { status: 400 });
        }
        const woreda = await db.subCityArea.findFirst({
          where: { name: childArea, subCity: { name: childSubCity } },
        });
        if (!woreda) {
          return NextResponse.json(
            { error: `"${childArea}" is not a woreda of "${childSubCity}"` },
            { status: 400 }
          );
        }
      }

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
        update: { targetValue: value, status: 'ACTIVE', updatedAt: new Date() },
        create: {
          level: childLevel,
          subCity: childSubCity,
          area: childArea,
          periodType: parent.periodType,
          periodStart: parent.periodStart,
          periodEnd: parent.periodEnd,
          targetValue: value,
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
