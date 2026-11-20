import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAuthUser } from '@/lib/api-auth';
import { ensureSettingsSeeded } from '@/lib/seed-settings';

export const dynamic = 'force-dynamic';

// GET /api/sub-cities — list sub-cities with their areas (any logged-in user)
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSettingsSeeded();

    const subCities = await db.subCity.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        areas: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });

    return NextResponse.json({
      subCities: subCities.map((sc) => ({
        id: sc.id,
        name: sc.name,
        areas: sc.areas.map((a) => a.name),
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/sub-cities — create a new sub-city (admin only)
export async function POST(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const name = String(body?.name || '').trim();
    const areas: string[] = Array.isArray(body?.areas)
      ? body.areas.map((a: unknown) => String(a).trim()).filter(Boolean)
      : [];

    if (!name) {
      return NextResponse.json({ error: 'Sub-city name is required' }, { status: 400 });
    }

    const existing = await db.subCity.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: `Sub-city "${name}" already exists` }, { status: 409 });
    }

    const maxOrder = await db.subCity.aggregate({ _max: { sortOrder: true } });
    const created = await db.subCity.create({
      data: {
        name,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        areas: {
          create: areas.map((areaName, j) => ({ name: areaName, sortOrder: j })),
        },
      },
      include: { areas: true },
    });

    return NextResponse.json({ subCity: { id: created.id, name: created.name, areas: created.areas.map((a) => a.name) } }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
