import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { loadAnalyzedInitiatives } from '@/lib/initiative-queries';
import { INITIATIVE_STATUSES } from '@/lib/initiative-monitor';

// GET /api/initiatives/[id] — one initiative, analyzed (targets vs actual, gap, delay)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [initiative] = await loadAnalyzedInitiatives({ id });
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }
    return NextResponse.json(initiative);
  } catch (error) {
    console.error('Error fetching initiative:', error);
    return NextResponse.json({ error: 'Failed to fetch initiative' }, { status: 500 });
  }
}

// PATCH /api/initiatives/[id] — admin: edit the initiative or move it along
// the follow-up lifecycle. Reaching FULLY_OPERATIONAL stamps operationalDate.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await request.json();
    const existing = await db.initiative.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.name != null) {
      if (!String(body.name).trim()) return NextResponse.json({ error: 'Name can not be empty' }, { status: 400 });
      data.name = String(body.name).trim();
    }
    if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
    if (body.category != null) data.category = String(body.category);
    if (body.area !== undefined) data.area = body.area ? String(body.area) : null;
    if (body.location !== undefined) data.location = body.location ? String(body.location) : null;
    if (body.contactName !== undefined) data.contactName = body.contactName ? String(body.contactName) : null;
    if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone ? String(body.contactPhone) : null;
    if (body.departmentId != null) {
      const department = await db.department.findUnique({ where: { id: String(body.departmentId) } });
      if (!department) return NextResponse.json({ error: 'Responsible department not found' }, { status: 400 });
      data.departmentId = String(body.departmentId);
    }
    if (body.subCity != null) data.subCity = String(body.subCity);

    if (body.establishmentDate !== undefined) {
      data.establishmentDate = body.establishmentDate
        ? new Date(`${String(body.establishmentDate).slice(0, 10)}T00:00:00.000Z`)
        : null;
    }
    if (body.expectedOperationalDate !== undefined) {
      data.expectedOperationalDate = body.expectedOperationalDate
        ? new Date(`${String(body.expectedOperationalDate).slice(0, 10)}T00:00:00.000Z`)
        : null;
    }

    // status transition — stamp the actual fully-operational date automatically
    if (body.status != null) {
      const status = String(body.status);
      if (!INITIATIVE_STATUSES.includes(status as (typeof INITIATIVE_STATUSES)[number])) {
        return NextResponse.json({ error: `Invalid status "${status}"` }, { status: 400 });
      }
      data.status = status;
      if (status === 'FULLY_OPERATIONAL' && !existing.operationalDate) {
        data.operationalDate = body.operationalDate
          ? new Date(`${String(body.operationalDate).slice(0, 10)}T00:00:00.000Z`)
          : new Date();
      }
      if (status !== 'FULLY_OPERATIONAL') {
        data.operationalDate = null;
      }
    } else if (body.operationalDate !== undefined) {
      data.operationalDate = body.operationalDate
        ? new Date(`${String(body.operationalDate).slice(0, 10)}T00:00:00.000Z`)
        : null;
    }

    const updated = await db.initiative.update({
      where: { id },
      data,
      include: { department: { select: { name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating initiative:', error);
    return NextResponse.json({ error: 'Failed to update initiative' }, { status: 500 });
  }
}

// DELETE /api/initiatives/[id] — admin (cascades targets + daily reports)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const { id } = await params;
    const existing = await db.initiative.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }
    await db.initiative.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting initiative:', error);
    return NextResponse.json({ error: 'Failed to delete initiative' }, { status: 500 });
  }
}
