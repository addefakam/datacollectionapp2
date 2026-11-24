import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// PUT /api/sub-cities/[id] — rename sub-city and/or replace its areas (admin only)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const name = body?.name != null ? String(body.name).trim() : undefined;
    const areas: string[] | undefined = Array.isArray(body?.areas)
      ? body.areas.map((a: unknown) => String(a).trim()).filter(Boolean)
      : undefined;

    const subCity = await db.subCity.findUnique({ where: { id } });
    if (!subCity) {
      return NextResponse.json({ error: 'Sub-city not found' }, { status: 404 });
    }

    if (name && name !== subCity.name) {
      const dup = await db.subCity.findUnique({ where: { name } });
      if (dup) {
        return NextResponse.json({ error: `Sub-city "${name}" already exists` }, { status: 409 });
      }
    }

    const updated = await db.$transaction(async (tx) => {
      if (name) {
        await tx.subCity.update({ where: { id }, data: { name } });
      }
      if (areas) {
        // Replace the area list; unique constraint prevents duplicates
        await tx.subCityArea.deleteMany({ where: { subCityId: id } });
        await tx.subCityArea.createMany({
          data: areas.map((areaName, j) => ({ subCityId: id, name: areaName, sortOrder: j })),
        });
      }
      return tx.subCity.findUnique({
        where: { id },
        include: { areas: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      });
    });

    return NextResponse.json({
      subCity: updated
        ? { id: updated.id, name: updated.name, areas: updated.areas.map((a) => a.name) }
        : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // P2002 = unique constraint violation (duplicate area names)
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Duplicate area names are not allowed' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/sub-cities/[id] — delete a sub-city and its areas (admin only)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const subCity = await db.subCity.findUnique({ where: { id } });
    if (!subCity) {
      return NextResponse.json({ error: 'Sub-city not found' }, { status: 404 });
    }

    await db.subCity.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
