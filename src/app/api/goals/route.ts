import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import {
  analyzeGoal,
  getMetric,
  isPeriodType,
  metricsForModule,
  periodRange,
} from '@/lib/goals';

// GET /api/goals?module=small-enterprise — list goals (optionally one initiative) with live progress analysis
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const module = searchParams.get('module');

    const goals = await db.goal.findMany({
      where: { status: 'ACTIVE', ...(module ? { module } : {}) },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
    });

    const withProgress = await Promise.all(
      goals.map(async (g) => ({
        ...g,
        progress: await analyzeGoal(g),
      }))
    );

    return NextResponse.json({ data: withProgress });
  } catch (error) {
    console.error('Error fetching goals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch goals', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST /api/goals — set a new weekly / monthly / yearly goal
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const { metric, periodType, refDate, targetValue, owner } = body;

    // Initiative this goal belongs to — defaults to the original MSE module.
    const goalModule = body.module ? String(body.module) : 'small-enterprise';
    const metricDef = getMetric(String(metric));
    if (!metric || !metricDef) {
      const valid = metricsForModule(goalModule).map((m) => m.key).join(', ');
      return NextResponse.json(
        { error: `Unknown metric. Use one of: ${valid}` },
        { status: 400 }
      );
    }
    if (metricDef.module !== goalModule) {
      return NextResponse.json(
        { error: `Metric "${metric}" does not belong to the "${goalModule}" initiative` },
        { status: 400 }
      );
    }
    if (!periodType || !isPeriodType(String(periodType))) {
      return NextResponse.json({ error: 'periodType must be weekly, monthly or yearly' }, { status: 400 });
    }
    const target = Number(targetValue);
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: 'Target value must be a positive number' }, { status: 400 });
    }

    const ref = refDate ? new Date(refDate) : new Date();
    if (Number.isNaN(ref.getTime())) {
      return NextResponse.json({ error: 'Invalid refDate' }, { status: 400 });
    }

    const { start, end } = periodRange(String(periodType) as 'weekly' | 'monthly' | 'yearly', ref);

    // No duplicate goals for the same module, metric & period
    const duplicate = await db.goal.findFirst({
      where: { module: goalModule, metric: String(metric), periodType: String(periodType), periodStart: start },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'A goal for this metric and period already exists — edit it instead' },
        { status: 409 }
      );
    }

    const goal = await db.goal.create({
      data: {
        module: goalModule,
        metric: String(metric),
        periodType: String(periodType),
        periodStart: start,
        periodEnd: end,
        targetValue: target,
        owner: owner ? String(owner).trim() || null : null,
      },
    });

    return NextResponse.json({ ...goal, progress: await analyzeGoal(goal) }, { status: 201 });
  } catch (error) {
    console.error('Error creating goal:', error);
    return NextResponse.json(
      { error: 'Failed to create goal', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
