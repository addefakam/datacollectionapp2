import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { utcMidnight } from '@/lib/donation-campaign';

/**
 * Office achievement records for one donation campaign — the donations an
 * office received on a day: cash amount plus in-kind contributions and
 * their estimated value. Any signed-in user can record on behalf of an
 * office; the coordination office reviews everything in the office-wise
 * report. Multiple entries per office per day are allowed (collections
 * happen several times a day); wrong rows can be removed by an admin.
 */

// POST /api/donation-campaigns/[id]/donations
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const campaign = await db.donationCampaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    if (campaign.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `This campaign is ${campaign.status.toLowerCase()} — achievement records are only accepted while it is ACTIVE` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { departmentId, reportDate, cashAmount, inKindValue, inKindDetails, donorsCount, notes } = body;

    if (!departmentId) {
      return NextResponse.json({ error: 'Select the office that received the donations' }, { status: 400 });
    }
    const department = await db.department.findUnique({ where: { id: String(departmentId) } });
    if (!department) {
      return NextResponse.json({ error: 'Selected office not found' }, { status: 400 });
    }

    if (!reportDate) {
      return NextResponse.json({ error: 'Report date is required' }, { status: 400 });
    }
    const date = utcMidnight(String(reportDate));
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid report date' }, { status: 400 });
    }
    if (date > utcMidnight(new Date().toISOString())) {
      return NextResponse.json({ error: 'Report date can not be in the future' }, { status: 400 });
    }

    const cash = cashAmount == null || cashAmount === '' ? 0 : Number(cashAmount);
    const inKind = inKindValue == null || inKindValue === '' ? 0 : Number(inKindValue);
    if (!Number.isFinite(cash) || cash < 0) {
      return NextResponse.json({ error: 'Cash amount must be 0 or more' }, { status: 400 });
    }
    if (!Number.isFinite(inKind) || inKind < 0) {
      return NextResponse.json({ error: 'In-kind value must be 0 or more' }, { status: 400 });
    }
    if (cash === 0 && inKind === 0) {
      return NextResponse.json(
        { error: 'Enter the cash collected, the estimated value of in-kind donations, or both' },
        { status: 400 }
      );
    }

    const donors = donorsCount == null || donorsCount === '' ? 0 : Number(donorsCount);
    if (!Number.isInteger(donors) || donors < 0) {
      return NextResponse.json({ error: 'Donors count must be a whole number of 0 or more' }, { status: 400 });
    }

    const created = await db.donationEntry.create({
      data: {
        campaignId: id,
        departmentId: String(departmentId),
        reportDate: date,
        cashAmount: cash,
        inKindValue: inKind,
        inKindDetails:
          inKindDetails != null && String(inKindDetails).trim() ? String(inKindDetails).trim() : null,
        donorsCount: donors,
        notes: notes != null && String(notes).trim() ? String(notes).trim() : null,
        reportedById: user.id,
        reportedByName: user.name || user.username || null,
      },
    });

    return NextResponse.json(
      { ...created, reportDate: created.reportDate.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error recording donation entry:', error);
    return NextResponse.json(
      { error: 'Failed to record achievement', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET /api/donation-campaigns/[id]/donations?departmentId= — the entries of one campaign
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('departmentId');

    const where: Record<string, unknown> = { campaignId: id };
    if (departmentId) where.departmentId = departmentId;

    const donations = await db.donationEntry.findMany({
      where,
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      include: { department: { select: { name: true } } },
    });

    return NextResponse.json({
      data: donations.map((d) => ({
        ...d,
        departmentName: d.department.name,
        department: undefined,
        reportDate: d.reportDate.toISOString(),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      total: donations.length,
    });
  } catch (error) {
    console.error('Error fetching donation entries:', error);
    return NextResponse.json({ error: 'Failed to fetch donation entries' }, { status: 500 });
  }
}
