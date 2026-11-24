import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// PUT /api/industry-categories/[id] — rename a category (admin only)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const name = String(body?.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const category = await db.industryCategory.findUnique({ where: { id } });
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    if (name !== category.name) {
      const dup = await db.industryCategory.findUnique({ where: { name } });
      if (dup) {
        return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
      }
    }

    const updated = await db.industryCategory.update({ where: { id }, data: { name } });
    return NextResponse.json({ category: { id: updated.id, name: updated.name } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/industry-categories/[id] — delete a category (admin only)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { id } = await params;
    const category = await db.industryCategory.findUnique({ where: { id } });
    if (!category) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }

    // Count industries currently using this category so the admin can be warned
    const inUse = await db.industry.count({ where: { sector: category.name } });

    await db.industryCategory.delete({ where: { id } });
    return NextResponse.json({ success: true, industriesAffected: inUse });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
