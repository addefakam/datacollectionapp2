import { db } from '@/lib/db';
import { SME_STATUSES, smePeriodPace, smeUnitStatus, type SmeStatus } from '@/lib/sme';

/**
 * Server-side performance computations for the Small Enterprise registration
 * & performance monitoring module. Actual values are computed live from the
 * SmallEnterprise records per administrative scope (city / sub-city / woreda).
 */

export interface SmeScopeStanding {
  byStatus: Record<SmeStatus, number>;
  total: number;
  members: number;
  femaleMembers: number;
}

/** Current standing of SMEs in a scope: counts by status + total members. */
export async function smeScopeStanding(
  subCity?: string,
  area?: string
): Promise<SmeScopeStanding> {
  const where: Record<string, unknown> = {};
  if (subCity) where.subCity = subCity;
  if (area) where.area = area;

  const grouped = await db.smallEnterprise.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
    _sum: { employeeCount: true, femaleEmployees: true },
  });

  const byStatus: Record<SmeStatus, number> = {
    REGISTERED: 0,
    FULLY_LEGALIZED: 0,
    AWAITING_OPERATION: 0,
    OPERATIONAL: 0,
  };
  let total = 0;
  let members = 0;
  let femaleMembers = 0;
  for (const g of grouped) {
    const key = (SME_STATUSES as readonly string[]).includes(g.status)
      ? (g.status as SmeStatus)
      : 'REGISTERED';
    byStatus[key] += g._count._all;
    total += g._count._all;
    members += g._sum.employeeCount ?? 0;
    femaleMembers += g._sum.femaleEmployees ?? 0;
  }
  return { byStatus, total, members, femaleMembers };
}

/** Number of SMEs registered within [start, end] in a scope. */
export async function smeRegisteredInPeriod(
  subCity: string | undefined,
  area: string | undefined,
  start: Date,
  end: Date
): Promise<number> {
  const where: Record<string, unknown> = { createdAt: { gte: start, lte: end } };
  if (subCity) where.subCity = subCity;
  if (area) where.area = area;
  return db.smallEnterprise.count({ where });
}

/** Live performance analysis for one SmeTarget row. */
export async function computeSmeTargetProgress(t: {
  level: string;
  subCity: string;
  area: string;
  periodType: string;
  periodStart: Date;
  periodEnd: Date;
  targetValue: number;
}) {
  const subCity = t.level === 'CITY' ? undefined : t.subCity;
  const area = t.level === 'WOREDA' ? t.area : undefined;

  const [actual, standing] = await Promise.all([
    smeRegisteredInPeriod(subCity, area, t.periodStart, t.periodEnd),
    smeScopeStanding(subCity, area),
  ]);

  const target = t.targetValue || 0;
  const now = new Date();
  const pending = standing.total - standing.byStatus.OPERATIONAL;

  return {
    actual,
    achievementPct: target > 0 ? Math.round((actual / target) * 1000) / 10 : 0,
    pacePct: smePeriodPace(t.periodStart, t.periodEnd, now),
    unitStatus: smeUnitStatus(target, actual, t.periodStart, t.periodEnd, now),
    standing,
    pending,
    operationalRate:
      standing.total > 0
        ? Math.round((standing.byStatus.OPERATIONAL / standing.total) * 1000) / 10
        : 0,
  };
}
