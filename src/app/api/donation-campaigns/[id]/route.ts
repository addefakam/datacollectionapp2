import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import { analyzeCampaign, type AssignmentDTO, type DonationDTO } from '@/lib/donation-campaign';

/**
 * One donation campaign: full detail with its office distribution, the
 * donation achievement entries and the live office-wise analysis.
 *
 * PATCH (admin) also re-distributes the goal: pass the full `assignments`
 * array and it is synced — offices added, minimums updated, removed offices
 * deleted (their already-reported entries are kept and counted as
 * "no minimum set").
 */

// GET /api/donation-campaigns/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const campaign = await db.donationCampaign.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: { department: { select: { name: true } } },
        },
        donations: {
          orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
          include: { department: { select: { name: true } } },
        },
      },
    });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const { donations, assignments, ...rest } = campaign;
    const assignmentDTOs: AssignmentDTO[] = assignments.map((a) => ({
      id: a.id,
      campaignId: a.campaignId,
      departmentId: a.departmentId,
      departmentName: a.department.name,
      minimumAmount: a.minimumAmount,
      note: a.note,
    }));
    const donationDTOs: DonationDTO[] = donations.map((d) => ({
      id: d.id,
      campaignId: d.campaignId,
      departmentId: d.departmentId,
      departmentName: d.department.name,
      reportDate: d.reportDate.toISOString(),
      cashAmount: d.cashAmount,
      inKindValue: d.inKindValue,
      inKindDetails: d.inKindDetails,
      donorsCount: d.donorsCount,
      notes: d.notes,
      reportedByName: d.reportedByName,
      createdAt: d.createdAt.toISOString(),
    }));
    const analysis = analyzeCampaign(rest, assignmentDTOs, donationDTOs);

    return NextResponse.json({
      ...rest,
      startDate: rest.startDate.toISOString(),
      deadline: rest.deadline.toISOString(),
      createdAt: rest.createdAt.toISOString(),
      updatedAt: rest.updatedAt.toISOString(),
      assignments: assignmentDTOs,
      donations: donationDTOs,
      analysis,
    });
  } catch (error) {
    console.error('Error fetching donation campaign:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

// PATCH /api/donation-campaigns/[id] — update basics / status / distribution (admin)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await db.donationCampaign.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    // ---- basics ----
    const data: Record<string, unknown> = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
      data.name = name;
    }
    if (body.description != null) data.description = String(body.description).trim() || null;
    if (body.kindNote != null) data.kindNote = String(body.kindNote).trim() || null;
    if (body.currency != null) data.currency = String(body.currency).trim() || 'ETB';
    if (body.totalGoal != null) {
      const totalGoal = Number(body.totalGoal);
      if (!Number.isFinite(totalGoal) || totalGoal <= 0) {
        return NextResponse.json({ error: 'The campaign goal must be an amount greater than 0' }, { status: 400 });
      }
      data.totalGoal = totalGoal;
    }
    if (body.status != null) {
      const status = String(body.status);
      if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
        return NextResponse.json({ error: 'Status must be ACTIVE, COMPLETED or CANCELLED' }, { status: 400 });
      }
      data.status = status;
    }
    if (body.startDate != null) {
      const d = new Date(`${String(body.startDate).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
      data.startDate = d;
    }
    if (body.deadline != null) {
      const d = new Date(`${String(body.deadline).slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid deadline' }, { status: 400 });
      data.deadline = d;
    }

    const start = (data.startDate as Date) ?? existing.startDate;
    const end = (data.deadline as Date) ?? existing.deadline;
    if (end < start) {
      return NextResponse.json({ error: 'The deadline must be on or after the start date' }, { status: 400 });
    }

    const totalGoal = (data.totalGoal as number) ?? existing.totalGoal;

    // ---- assignment re-distribution (full sync) ----
    if (body.assignments != null) {
      if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
        return NextResponse.json(
          { error: 'Distribute the goal to at least one office — pass the full assignments array' },
          { status: 400 }
        );
      }
      const seen = new Set<string>();
      const clean: { departmentId: string; minimumAmount: number; note: string | null }[] = [];
      let distributed = 0;
      for (const a of body.assignments as Record<string, unknown>[]) {
        const departmentId = String(a.departmentId ?? '');
        const minimumAmount = Number(a.minimumAmount);
        if (!departmentId || !Number.isFinite(minimumAmount) || minimumAmount <= 0) {
          return NextResponse.json(
            { error: 'Every office assignment needs a department and a minimum greater than 0' },
            { status: 400 }
          );
        }
        if (seen.has(departmentId)) {
          return NextResponse.json({ error: 'The same office can not be assigned twice' }, { status: 400 });
        }
        seen.add(departmentId);
        distributed += minimumAmount;
        clean.push({
          departmentId,
          minimumAmount,
          note: a.note != null && String(a.note).trim() ? String(a.note).trim() : null,
        });
      }
      if (distributed > totalGoal) {
        return NextResponse.json(
          {
            error: `The distributed minimums (${distributed.toLocaleString('en-US')}) exceed the campaign goal (${totalGoal.toLocaleString('en-US')})`,
          },
          { status: 400 }
        );
      }
      const departments = await db.department.findMany({ where: { id: { in: clean.map((c) => c.departmentId) } } });
      if (departments.length !== clean.length) {
        return NextResponse.json({ error: 'One of the assigned offices no longer exists' }, { status: 400 });
      }

      const current = await db.donationCampaignAssignment.findMany({ where: { campaignId: id } });
      const currentIds = new Set(current.map((c) => c.departmentId));
      const nextIds = new Set(clean.map((c) => c.departmentId));

      await db.$transaction(async (tx) => {
        // remove offices no longer in the list (entries kept, counted unassigned)
        for (const c of current) {
          if (!nextIds.has(c.departmentId)) {
            await tx.donationCampaignAssignment.delete({ where: { id: c.id } });
          }
        }
        for (const c of clean) {
          if (currentIds.has(c.departmentId)) {
            await tx.donationCampaignAssignment.update({
              where: { campaignId_departmentId: { campaignId: id, departmentId: c.departmentId } },
              data: { minimumAmount: c.minimumAmount, note: c.note },
            });
          } else {
            await tx.donationCampaignAssignment.create({
              data: { campaignId: id, departmentId: c.departmentId, minimumAmount: c.minimumAmount, note: c.note },
            });
          }
        }
      });
    }

    const updated = await db.donationCampaign.update({
      where: { id },
      data,
      include: {
        assignments: { orderBy: { createdAt: 'asc' }, include: { department: { select: { name: true } } } },
      },
    });

    return NextResponse.json({
      ...updated,
      startDate: updated.startDate.toISOString(),
      deadline: updated.deadline.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Error updating donation campaign:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/donation-campaigns/[id] — remove the campaign and its entries (admin)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;

    const existing = await db.donationCampaign.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    await db.donationCampaign.delete({ where: { id } }); // entries + assignments cascade
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting donation campaign:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
