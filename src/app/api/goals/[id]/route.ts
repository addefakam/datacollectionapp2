import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { analyzeGoal } from '@/lib/goals';

// PUT /api/goals/[id] — adjust target / owner, or archive a goal
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();

    const existing = await db.goal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.targetValue !== undefined) {
      const target = Number(body.targetValue);
      if (!Number.isFinite(target) || target <= 0) {
        return NextResponse.json({ error: 'Target value must be a positive number' }, { status: 400 });
      }
      data.targetValue = target;
    }
    if (body.owner !== undefined) {
      data.owner = body.owner ? String(body.owner).trim() || null : null;
    }
    if (body.status !== undefined) {
      if (!['ACTIVE', 'ARCHIVED'].includes(String(body.status))) {
        return NextResponse.json({ error: 'status must be ACTIVE or ARCHIVED' }, { status: 400 });
      }
      data.status = String(body.status);
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const goal = await db.goal.update({ where: { id }, data });
    return NextResponse.json({ ...goal, progress: await analyzeGoal(goal) });
  } catch (error) {
    console.error('Error updating goal:', error);
    return NextResponse.json(
      { error: 'Failed to update goal', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/goals/[id] — remove a goal
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = await db.goal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await db.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    return NextResponse.json(
      { error: 'Failed to delete goal', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
