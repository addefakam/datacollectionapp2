import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

// GET /api/initiatives/[id]/targets — the targets set on one initiative
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const targets = await db.initiativeTarget.findMany({
      where: { initiativeId: id },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(targets);
  } catch (error) {
    console.error('Error fetching targets:', error);
    return NextResponse.json({ error: 'Failed to fetch targets' }, { status: 500 });
  }
}

// POST /api/initiatives/[id]/targets — set a target on the initiative (admin)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();
    const { metric, unit, targetValue, periodType, dueDate } = body;

    const initiative = await db.initiative.findUnique({ where: { id } });
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    if (!metric || !String(metric).trim()) {
      return NextResponse.json({ error: 'Target metric is required' }, { status: 400 });
    }
    const value = Number(targetValue);
    if (!Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Target value must be greater than 0' }, { status: 400 });
    }

    const due = dueDate ? new Date(`${String(dueDate).slice(0, 10)}T00:00:00.000Z`) : null;
    if (due && Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
    }

    const target = await db.initiativeTarget.create({
      data: {
        initiativeId: id,
        metric: String(metric).trim(),
        unit: unit ? String(unit).trim() || null : null,
        targetValue: value,
        periodType: String(periodType ?? 'total'),
        dueDate: due,
      },
    });
    return NextResponse.json(target, { status: 201 });
  } catch (error) {
    console.error('Error creating target:', error);
    return NextResponse.json({ error: 'Failed to create target' }, { status: 500 });
  }
}
