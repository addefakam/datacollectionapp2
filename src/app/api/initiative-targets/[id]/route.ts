import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

// PATCH /api/initiative-targets/[id] — adjust a target (admin). Archiving a
// target removes it from the active attainment math without losing history.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();
    const existing = await db.initiativeTarget.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.metric != null) {
      if (!String(body.metric).trim()) return NextResponse.json({ error: 'Metric can not be empty' }, { status: 400 });
      data.metric = String(body.metric).trim();
    }
    if (body.unit !== undefined) data.unit = body.unit ? String(body.unit).trim() || null : null;
    if (body.targetValue != null) {
      const value = Number(body.targetValue);
      if (!Number.isFinite(value) || value <= 0) {
        return NextResponse.json({ error: 'Target value must be greater than 0' }, { status: 400 });
      }
      data.targetValue = value;
    }
    if (body.periodType != null) data.periodType = String(body.periodType);
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(`${String(body.dueDate).slice(0, 10)}T00:00:00.000Z`) : null;
    }
    if (body.status != null) {
      if (!['ACTIVE', 'ARCHIVED'].includes(String(body.status))) {
        return NextResponse.json({ error: 'Status must be ACTIVE or ARCHIVED' }, { status: 400 });
      }
      data.status = String(body.status);
    }

    const updated = await db.initiativeTarget.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating target:', error);
    return NextResponse.json({ error: 'Failed to update target' }, { status: 500 });
  }
}

// DELETE /api/initiative-targets/[id] — remove a target (admin). Daily
// reports keep their history (targetId is set null on delete).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = await db.initiativeTarget.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }
    await db.initiativeTarget.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting target:', error);
    return NextResponse.json({ error: 'Failed to delete target' }, { status: 500 });
  }
}
