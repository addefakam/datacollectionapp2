import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAuthUser } from '@/lib/api-auth';
import { ensureSettingsSeeded } from '@/lib/seed-settings';

export const dynamic = 'force-dynamic';

// GET /api/industry-categories — list industry categories (any logged-in user)
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureSettingsSeeded();

    const categories = await db.industryCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/industry-categories — create a new category (admin only)
export async function POST(request: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const name = String(body?.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const existing = await db.industryCategory.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
    }

    const maxOrder = await db.industryCategory.aggregate({ _max: { sortOrder: true } });
    const created = await db.industryCategory.create({
      data: { name, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });

    return NextResponse.json({ category: { id: created.id, name: created.name } }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
