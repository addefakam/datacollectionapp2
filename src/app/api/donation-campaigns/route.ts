import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireAdmin } from '@/lib/api-auth';
import { analyzeCampaign } from '@/lib/donation-campaign';

/**
 * Bussa Goonofaa Charity — donation campaigns.
 *
 * The coordination office sets ONE campaign goal and distributes it as
 * minimum collection amounts across responsible offices; offices report
 * their achievements (cash + in-kind) during the campaign; the analysis
 * (attainment, pace, gaps) is computed live for the office-wise report.
 */

interface AssignmentInput {
  departmentId: string;
  minimumAmount: number;
  note?: string | null;
}

/** Validate the campaign payload + its office distribution. */
async function validateCampaignPayload(body: Record<string, unknown>, partial = false) {
  const errors: string[] = [];
  const name = body.name != null ? String(body.name).trim() : undefined;
  const description = body.description != null ? String(body.description).trim() || null : undefined;
  const kindNote = body.kindNote != null ? String(body.kindNote).trim() || null : undefined;
  const currency = body.currency != null ? String(body.currency).trim() || 'ETB' : undefined;
  const totalGoal = body.totalGoal != null ? Number(body.totalGoal) : undefined;
  const status = body.status != null ? String(body.status).trim() : undefined;

  if (!partial || body.name != null) {
    if (!name) errors.push('Campaign name is required');
  }
  if (!partial || body.totalGoal != null) {
    if (totalGoal == null || !Number.isFinite(totalGoal) || totalGoal <= 0) {
      errors.push('The campaign goal must be an amount greater than 0');
    }
  }
  if (status != null && !['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
    errors.push('Status must be ACTIVE, COMPLETED or CANCELLED');
  }

  const startDate = body.startDate ? new Date(`${String(body.startDate).slice(0, 10)}T00:00:00.000Z`) : undefined;
  const deadline = body.deadline ? new Date(`${String(body.deadline).slice(0, 10)}T00:00:00.000Z`) : undefined;
  if (!partial || body.startDate != null) {
    if (!startDate || Number.isNaN(startDate.getTime())) errors.push('A valid start date is required');
  }
  if (!partial || body.deadline != null) {
    if (!deadline || Number.isNaN(deadline.getTime())) errors.push('A valid deadline is required');
  }
  if (startDate && deadline && Number.isNaN(startDate.getTime()) === false && deadline < startDate) {
    errors.push('The deadline must be on or after the start date');
  }

  // office distribution
  const rawAssignments: AssignmentInput[] = Array.isArray(body.assignments) ? body.assignments : [];
  const cleanAssignments: {
    departmentId: string;
    departmentName: string;
    minimumAmount: number;
    note: string | null;
  }[] = [];
  const seen = new Set<string>();
  for (const a of rawAssignments) {
    const departmentId = String(a.departmentId ?? '');
    const minimumAmount = Number(a.minimumAmount);
    if (!departmentId) {
      errors.push('Every assigned office needs a department');
      break;
    }
    if (!Number.isFinite(minimumAmount) || minimumAmount <= 0) {
      errors.push('Every office minimum must be an amount greater than 0');
      break;
    }
    if (seen.has(departmentId)) {
      errors.push('The same office can not be assigned twice');
      break;
    }
    seen.add(departmentId);
    const department = await db.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      errors.push('One of the assigned offices no longer exists');
      break;
    }
    cleanAssignments.push({
      departmentId,
      departmentName: department.name,
      minimumAmount,
      note: a.note != null && String(a.note).trim() ? String(a.note).trim() : null,
    });
  }

  const distributed = cleanAssignments.reduce((s, a) => s + a.minimumAmount, 0);
  const goal = totalGoal != null && Number.isFinite(totalGoal) ? totalGoal : null;
  if (goal != null && distributed > goal) {
    errors.push(
      `The distributed minimums (${distributed.toLocaleString('en-US')}) exceed the campaign goal (${goal.toLocaleString('en-US')}) — lower the office minimums or raise the goal`
    );
  }

  return {
    errors,
    data: {
      name,
      description,
      kindNote,
      currency,
      totalGoal,
      status,
      startDate,
      deadline,
      assignments: cleanAssignments,
      distributed,
    },
  };
}

// GET /api/donation-campaigns?status=&active=true — campaigns with their
// distribution, collected amounts and live analysis.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const campaigns = await db.donationCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignments: {
          orderBy: { createdAt: 'asc' },
          include: { department: { select: { name: true } } },
        },
        donations: {
          orderBy: { reportDate: 'desc' },
          select: {
            departmentId: true,
            reportDate: true,
            cashAmount: true,
            inKindValue: true,
            donorsCount: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const data = campaigns.map((c) => {
      const { donations, assignments, ...campaign } = c;
      const assignmentDTOs = assignments.map((a) => ({
        id: a.id,
        campaignId: a.campaignId,
        departmentId: a.departmentId,
        // defensive: an orphaned assignment (department removed out-of-band)
        // must never break the whole campaigns list
        departmentName: a.department?.name ?? 'Unlisted office',
        minimumAmount: a.minimumAmount,
        note: a.note,
      }));
      const analysis = analyzeCampaign(
        campaign,
        assignmentDTOs,
        donations.map((d) => ({
          departmentId: d.departmentId,
          departmentName: d.department?.name ?? 'Unlisted office',
          reportDate: d.reportDate,
          cashAmount: d.cashAmount,
          inKindValue: d.inKindValue,
          donorsCount: d.donorsCount,
        }))
      );
      return {
        ...campaign,
        assignments: assignmentDTOs,
        analysis,
      };
    });

    return NextResponse.json({ data, total: data.length });
  } catch (error) {
    console.error('Error fetching donation campaigns:', error);
    return NextResponse.json({ error: 'Failed to fetch donation campaigns' }, { status: 500 });
  }
}

// POST /api/donation-campaigns — set a campaign goal and distribute it to
// offices (admin: the charity coordination office plans the campaign).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const { errors, data } = await validateCampaignPayload(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }
    if (data.assignments.length === 0) {
      return NextResponse.json(
        { error: 'Distribute the goal to at least one office before saving' },
        { status: 400 }
      );
    }

    const created = await db.donationCampaign.create({
      data: {
        name: data.name as string,
        description: data.description ?? null,
        totalGoal: data.totalGoal as number,
        currency: data.currency ?? 'ETB',
        kindNote: data.kindNote ?? null,
        startDate: data.startDate as Date,
        deadline: data.deadline as Date,
        status: (data.status as string) ?? 'ACTIVE',
        createdById: auth.user.id,
        createdByName: auth.user.name || auth.user.username || null,
        assignments: {
          create: data.assignments.map((a) => ({
            departmentId: a.departmentId,
            minimumAmount: a.minimumAmount,
            note: a.note,
          })),
        },
      },
      include: {
        assignments: { orderBy: { createdAt: 'asc' }, include: { department: { select: { name: true } } } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating donation campaign:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
