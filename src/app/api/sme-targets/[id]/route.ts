import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { computeSmeTargetProgress } from '@/lib/sme-server';

// PUT /api/sme-targets/[id] — edit a target's value / note (admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();

    const existing = await db.smeTarget.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'SME target not found' }, { status: 404 });
    }

    let targetValue = existing.targetValue;
    if (body.targetValue !== undefined) {
      const v = Number(body.targetValue);
      if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
        return NextResponse.json(
          { error: 'Target value must be a positive whole number of enterprises' },
          { status: 400 }
        );
      }
      targetValue = v;
    }

    const note =
      body.note !== undefined
        ? body.note
          ? String(body.note).trim() || null
          : null
        : existing.note;

    const updated = await db.smeTarget.update({
      where: { id },
      data: { targetValue, note },
    });

    return NextResponse.json({
      ...updated,
      progress: await computeSmeTargetProgress(updated),
    });
  } catch (error) {
    console.error('Error updating SME target:', error);
    return NextResponse.json(
      { error: 'Failed to update SME target', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/sme-targets/[id] — remove a target (admin)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = await db.smeTarget.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'SME target not found' }, { status: 404 });
    }
    await db.smeTarget.delete({ where: { id } });
    return NextResponse.json(existing);
  } catch (error) {
    console.error('Error deleting SME target:', error);
    return NextResponse.json(
      { error: 'Failed to delete SME target', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
