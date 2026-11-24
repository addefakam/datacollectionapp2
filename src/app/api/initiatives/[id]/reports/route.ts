import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import { utcMidnight } from '@/lib/initiative-monitor';

// GET /api/initiatives/[id]/reports — the daily report timeline of one initiative
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const reports = await db.initiativeDailyReport.findMany({
      where: { initiativeId: id },
      orderBy: { reportDate: 'desc' },
      include: { target: { select: { metric: true, unit: true } } },
      take: 200,
    });
    return NextResponse.json(reports);
  } catch (error) {
    console.error('Error fetching daily reports:', error);
    return NextResponse.json({ error: 'Failed to fetch daily reports' }, { status: 500 });
  }
}

// POST /api/initiatives/[id]/reports — the department's daily achievement
// report. One report per initiative per day: submitting the same day again
// updates it (upsert), so the record for a day is always the department's
// final version.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const {
      reportDate,
      activities,
      achievedValue,
      targetId,
      challenges,
      supportNeeded,
    } = body;

    const initiative = await db.initiative.findUnique({ where: { id } });
    if (!initiative) {
      return NextResponse.json({ error: 'Initiative not found' }, { status: 404 });
    }

    if (!reportDate) {
      return NextResponse.json({ error: 'Report date is required' }, { status: 400 });
    }
    if (!activities || !String(activities).trim()) {
      return NextResponse.json({ error: 'Daily activities are required' }, { status: 400 });
    }

    const date = utcMidnight(String(reportDate));
    const today = utcMidnight(new Date());
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: 'Invalid report date' }, { status: 400 });
    }
    if (date > today) {
      return NextResponse.json({ error: 'Report date can not be in the future' }, { status: 400 });
    }

    let achieved: number | null = null;
    if (achievedValue != null && achievedValue !== '') {
      achieved = Number(achievedValue);
      if (!Number.isFinite(achieved) || achieved < 0) {
        return NextResponse.json({ error: 'Achieved value must be a non-negative number' }, { status: 400 });
      }
    }

    if (targetId) {
      const target = await db.initiativeTarget.findUnique({ where: { id: String(targetId) } });
      if (!target || target.initiativeId !== id) {
        return NextResponse.json({ error: 'Target does not belong to this initiative' }, { status: 400 });
      }
    }

    const data = {
      activities: String(activities).trim(),
      achievedValue: achieved,
      targetId: targetId ? String(targetId) : null,
      challenges: challenges ? String(challenges) : null,
      supportNeeded: supportNeeded ? String(supportNeeded) : null,
      reportedById: user.id,
      reportedByName: user.name || user.username || null,
    };

    const report = await db.initiativeDailyReport.upsert({
      where: { initiativeId_reportDate: { initiativeId: id, reportDate: date } },
      create: { initiativeId: id, reportDate: date, ...data },
      update: data,
      include: { target: { select: { metric: true, unit: true } } },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error('Error submitting daily report:', error);
    return NextResponse.json(
      { error: 'Failed to submit daily report', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
