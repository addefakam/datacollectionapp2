import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/api-auth';
import {
  isSmePeriodType,
  SME_STATUSES,
  smePeriodLabel,
  smePeriodPace,
  smePeriodRange,
  smeUnitStatus,
  type SmeStatus,
  type SmeUnitStatus,
} from '@/lib/sme';
import {
  loadSmeTargetsForPeriod,
  smeRegisteredInPeriod,
  smeScopeStanding,
  smeTargetScopeKey,
} from '@/lib/sme-server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET /api/sme/performance?periodType=monthly|quarterly|yearly&ref=&subCity=
//
// Automated performance analysis of SME establishment per administrative
// level, computed live from the SmallEnterprise records + ACTIVE SmeTargets:
//   • no subCity   → city overview: one row per sub-city (SUB_CITY targets)
//   • subCity=name → woreda drill-down: one row per woreda (WOREDA targets)
//
// Each row: target vs actual registrations in the period, achievement rate,
// pace, standing pipeline (registered / legalized / awaiting / operational),
// pending SMEs, operational progress and members mobilized. Units without an
// assigned target are flagged for accountability.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periodTypeParam = searchParams.get('periodType');
    const periodType = isSmePeriodType(periodTypeParam) ? periodTypeParam : 'yearly';
    const refParam = searchParams.get('ref');
    const ref = refParam && !Number.isNaN(new Date(refParam).getTime()) ? new Date(refParam) : new Date();
    const subCityParam = searchParams.get('subCity');
    const drillSubCity = subCityParam ? String(subCityParam).trim() : '';

    const { start, end } = smePeriodRange(periodType, ref);
    const now = new Date();
    const pacePct = smePeriodPace(start, end, now);

    // ------------------------------------------------------------------
    // Units for the requested level — from the managed locations so every
    // administrative unit shows up (even those without records yet).
    // ------------------------------------------------------------------
    interface Unit {
      subCity: string;
      area: string; // '' for sub-city rows
      label: string;
    }
    let units: Unit[] = [];
    let scopeLevel: 'city' | 'subcity' = 'city';
    let drillName: string | null = null;

    if (drillSubCity) {
      const sc = await db.subCity.findUnique({
        where: { name: drillSubCity },
        include: { areas: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
      });
      if (!sc) {
        return NextResponse.json({ error: `Unknown sub-city "${drillSubCity}"` }, { status: 404 });
      }
      scopeLevel = 'subcity';
      drillName = sc.name;
      units = sc.areas.map((a) => ({ subCity: sc.name, area: a.name, label: a.name }));
    } else {
      const subCities = await db.subCity.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      units = subCities.map((sc) => ({ subCity: sc.name, area: '', label: sc.name }));
    }

    // ------------------------------------------------------------------
    // ACTIVE targets for the period at the row level (and the CITY-level
    // target when showing the city overview). Periods are matched by
    // overlap — not exact datetime equality — so targets still resolve when
    // the server timezone differs from the one used when the target was
    // created (exact matching zeroed every row: "Target 0, Registered 1").
    // ------------------------------------------------------------------
    const targetByScope = await loadSmeTargetsForPeriod(
      scopeLevel === 'city' ? 'SUB_CITY' : 'WOREDA',
      periodType,
      start,
      end
    );
    const targetOf = (subCity: string, area: string) =>
      targetByScope.get(smeTargetScopeKey(subCity, area))?.targetValue ?? 0;

    let cityTarget: number | null = null;
    if (scopeLevel === 'city') {
      const cityGoals = await loadSmeTargetsForPeriod('CITY', periodType, start, end);
      const cityGoal = cityGoals.get(smeTargetScopeKey('', ''));
      cityTarget = cityGoal ? cityGoal.targetValue : null;
    }

    // ------------------------------------------------------------------
    // Per-unit analysis: period registrations + current standing pipeline.
    // ------------------------------------------------------------------
    const rows = await Promise.all(
      units.map(async (u) => {
        const target = targetOf(u.subCity, u.area);
        const [actual, standing] = await Promise.all([
          smeRegisteredInPeriod(u.subCity, u.area || undefined, start, end),
          smeScopeStanding(u.subCity, u.area || undefined),
        ]);

        const pending = standing.total - standing.byStatus.OPERATIONAL;
        const achievementPct = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0;
        const unitStatus: SmeUnitStatus = smeUnitStatus(target, actual, start, end, now);

        return {
          subCity: u.subCity,
          area: u.area,
          label: u.label,
          target,
          actual,
          achievementPct,
          unitStatus,
          standing: standing.byStatus,
          standingTotal: standing.total,
          pending,
          operationalRate:
            standing.total > 0
              ? Math.round((standing.byStatus.OPERATIONAL / standing.total) * 1000) / 10
              : 0,
          members: standing.members,
          femaleMembers: standing.femaleMembers,
        };
      })
    );

    // ------------------------------------------------------------------
    // Aggregates (KPI cards + overall status donut).
    // ------------------------------------------------------------------
    const totals = rows.reduce(
      (acc, r) => {
        acc.totalTarget += r.target;
        acc.totalRegistered += r.actual;
        acc.pending += r.pending;
        acc.operational += r.standing.OPERATIONAL;
        acc.standingTotal += r.standingTotal;
        acc.members += r.members;
        acc.femaleMembers += r.femaleMembers;
        for (const s of Object.keys(r.standing) as SmeStatus[]) {
          acc.byStatus[s] = (acc.byStatus[s] ?? 0) + r.standing[s];
        }
        return acc;
      },
      {
        totalTarget: 0,
        totalRegistered: 0,
        pending: 0,
        operational: 0,
        standingTotal: 0,
        members: 0,
        femaleMembers: 0,
        byStatus: { REGISTERED: 0, FULLY_LEGALIZED: 0, AWAITING_OPERATION: 0, OPERATIONAL: 0 } as Record<SmeStatus, number>,
      }
    );

    const kpis = {
      totalTarget: totals.totalTarget,
      totalRegistered: totals.totalRegistered,
      achievementPct:
        totals.totalTarget > 0
          ? Math.round((totals.totalRegistered / totals.totalTarget) * 1000) / 10
          : 0,
      pending: totals.pending,
      operational: totals.operational,
      standingTotal: totals.standingTotal,
      operationalRate:
        totals.standingTotal > 0
          ? Math.round((totals.operational / totals.standingTotal) * 1000) / 10
          : 0,
      members: totals.members,
      femaleMembers: totals.femaleMembers,
      avgMembers: totals.standingTotal > 0 ? Math.round(totals.members / totals.standingTotal) : 0,
    };

    // ------------------------------------------------------------------
    // Enterprise-type breakdown — standing pipeline + period registrations
    // per enterprise type (for the "By Enterprise Type" report).
    // ------------------------------------------------------------------
    const scopeWhere: Record<string, unknown> = drillName
      ? { subCity: { equals: drillName, mode: 'insensitive' } }
      : {};
    const [typeStanding, typeRegistered] = (await Promise.all([
      db.smallEnterprise.groupBy({
        by: ['enterpriseType', 'status'],
        where: scopeWhere,
        _count: { _all: true },
        _sum: { employeeCount: true, femaleEmployees: true },
      }),
      db.smallEnterprise.groupBy({
        by: ['enterpriseType'],
        where: { ...scopeWhere, createdAt: { gte: start, lte: end } },
        _count: { _all: true },
      }),
    ])) as [
      Array<{
        enterpriseType: string;
        status: string;
        _count: { _all: number };
        _sum: { employeeCount: number | null; femaleEmployees: number | null };
      }>,
      Array<{ enterpriseType: string; _count: { _all: number } }>,
    ];

    const zeroStanding = (): Record<SmeStatus, number> => ({
      REGISTERED: 0,
      FULLY_LEGALIZED: 0,
      AWAITING_OPERATION: 0,
      OPERATIONAL: 0,
    });
    const typeMap = new Map<
      string,
      {
        type: string;
        standing: Record<SmeStatus, number>;
        standingTotal: number;
        registeredInPeriod: number;
        members: number;
        femaleMembers: number;
      }
    >();
    for (const g of typeStanding) {
      const row =
        typeMap.get(g.enterpriseType) ??
        {
          type: g.enterpriseType,
          standing: zeroStanding(),
          standingTotal: 0,
          registeredInPeriod: 0,
          members: 0,
          femaleMembers: 0,
        };
      const key = (SME_STATUSES as readonly string[]).includes(g.status)
        ? (g.status as SmeStatus)
        : 'REGISTERED';
      row.standing[key] += g._count._all;
      row.standingTotal += g._count._all;
      row.members += g._sum.employeeCount ?? 0;
      row.femaleMembers += g._sum.femaleEmployees ?? 0;
      typeMap.set(g.enterpriseType, row);
    }
    for (const g of typeRegistered) {
      const row = typeMap.get(g.enterpriseType);
      if (row) {
        row.registeredInPeriod = g._count._all;
      } else {
        typeMap.set(g.enterpriseType, {
          type: g.enterpriseType,
          standing: zeroStanding(),
          standingTotal: 0,
          registeredInPeriod: g._count._all,
          members: 0,
          femaleMembers: 0,
        });
      }
    }
    const byType = [...typeMap.values()].sort(
      (a, b) => b.standingTotal - a.standingTotal || a.type.localeCompare(b.type)
    );

    return NextResponse.json({
      period: {
        type: periodType,
        start: start.toISOString(),
        end: end.toISOString(),
        label: smePeriodLabel(periodType, start, end),
        pacePct,
      },
      scope: { level: scopeLevel, subCity: drillName },
      cityTarget,
      cityActual:
        scopeLevel === 'city'
          ? await smeRegisteredInPeriod(undefined, undefined, start, end)
          : null,
      kpis,
      totals: { byStatus: totals.byStatus, standingTotal: totals.standingTotal },
      rows: rows.sort((a, b) => b.actual - a.actual || b.target - a.target || a.label.localeCompare(b.label)),
      byType,
    });
  } catch (error) {
    console.error('Error computing SME performance:', error);
    return NextResponse.json(
      { error: 'Failed to compute SME performance', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
