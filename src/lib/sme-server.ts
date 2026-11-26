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

/**
 * Case-insensitive scope match. Records may arrive through imports or edits
 * whose spelling differs in case from the Settings names — strict equality
 * would silently zero every scoped aggregate (standing, progress, KPIs).
 */
function scopeFilter(value?: string): { equals: string; mode: 'insensitive' } | undefined {
  if (!value) return undefined;
  return { equals: value, mode: 'insensitive' };
}

/** Resolve a sub-city name to the canonical Settings name (case-insensitive); falls back to the trimmed input. */
export async function canonicalSubCity(input: string): Promise<string> {
  const v = String(input ?? '').trim();
  if (!v) return '';
  const sc = await db.subCity.findFirst({ where: { name: { equals: v, mode: 'insensitive' } } });
  return sc ? sc.name : v;
}

/** Resolve a woreda name under a canonical sub-city to the Settings name (case-insensitive); falls back to the trimmed input. */
export async function canonicalArea(subCity: string, input: string): Promise<string> {
  const v = String(input ?? '').trim();
  if (!v || !subCity) return v;
  const w = await db.subCityArea.findFirst({
    where: { name: { equals: v, mode: 'insensitive' }, subCity: { name: subCity } },
  });
  return w ? w.name : v;
}

/** Current standing of SMEs in a scope: counts by status + total members. */
export async function smeScopeStanding(
  subCity?: string,
  area?: string
): Promise<SmeScopeStanding> {
  const where: Record<string, unknown> = {};
  const sc = scopeFilter(subCity);
  const ar = scopeFilter(area);
  if (sc) where.subCity = sc;
  if (ar) where.area = ar;

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
  const sc = scopeFilter(subCity);
  const ar = scopeFilter(area);
  if (sc) where.subCity = sc;
  if (ar) where.area = ar;
  return db.smallEnterprise.count({ where });
}

// ---------------------------------------------------------------------------
// Target period matching
//
// SmeTarget rows store the period boundaries that smePeriodRange() computed on
// the server at creation time — i.e. in the server timezone of THAT moment.
// Matching them against the freshly computed boundaries with exact datetime
// equality silently breaks whenever the deployment container's timezone
// differs or changes (e.g. UTC at creation, Africa/Addis_Ababa at query): the
// yearly period then starts 2025-12-31T21:00Z instead of 2026-01-01T00:00Z,
// no target row matches, and every dashboard row reads "Target 0" while the
// registration count — a plain range query — still works ("Target 0,
// Registered 1").
//
// Same-type periods of the same length can only overlap when they are the
// same logical period, so an overlap match plus a "nearest periodStart wins"
// tie-break (tolerating a few hours of timezone drift, and never double
// counting duplicate rows created across a timezone change) is robust.
// ---------------------------------------------------------------------------

/** Normalized scope key: trimmed + lowercased, so target rows whose stored
 * names differ only in case or padding still match the Settings names. */
export function smeTargetScopeKey(subCity: string, area = ''): string {
  return `${String(subCity ?? '').trim().toLowerCase()}||${String(area ?? '').trim().toLowerCase()}`;
}

export interface SmeScopedTarget {
  subCity: string;
  area: string;
  targetValue: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * ACTIVE targets of one level for the logical period containing [start, end],
 * keyed by normalized scope (see smeTargetScopeKey). Among overlapping rows
 * for the same scope the one whose periodStart is nearest to `start` wins —
 * duplicates created across a timezone change never double-count.
 */
export async function loadSmeTargetsForPeriod(
  level: 'CITY' | 'SUB_CITY' | 'WOREDA',
  periodType: string,
  start: Date,
  end: Date
): Promise<Map<string, SmeScopedTarget>> {
  const rows = await db.smeTarget.findMany({
    where: {
      status: 'ACTIVE',
      level,
      periodType,
      // overlap, not exact equality — see the block comment above
      periodStart: { lte: end },
      periodEnd: { gte: start },
    },
  });

  const byScope = new Map<string, SmeScopedTarget>();
  for (const t of rows) {
    const key = smeTargetScopeKey(t.subCity, t.area);
    const prev = byScope.get(key);
    if (
      !prev ||
      Math.abs(t.periodStart.getTime() - start.getTime()) <
        Math.abs(prev.periodStart.getTime() - start.getTime())
    ) {
      byScope.set(key, {
        subCity: t.subCity,
        area: t.area,
        targetValue: t.targetValue,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
      });
    }
  }
  return byScope;
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
    // Flat status counts + member totals — the shape the UI contract
    // (SmeTargetManager TargetProgress) declares: standing[s] per status,
    // standing.members / standing.femaleMembers / standing.total on top.
    // (Returning the nested { byStatus, ... } object made every status chip
    // on the target cards read `undefined ?? 0` — i.e. always zero.)
    standing: {
      ...standing.byStatus,
      total: standing.total,
      members: standing.members,
      femaleMembers: standing.femaleMembers,
    },
    pending,
    operationalRate:
      standing.total > 0
        ? Math.round((standing.byStatus.OPERATIONAL / standing.total) * 1000) / 10
        : 0,
  };
}
