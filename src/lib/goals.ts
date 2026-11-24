import { db } from '@/lib/db';

/**
 * Goals & Targets engine for the Dhibayyuu initiative (Small Enterprise / MSE).
 *
 * Officials set weekly / monthly / yearly targets on initiative metrics;
 * progress is computed live from the recorded survey data, with
 * percentage-based achievement analysis and pace / trend comparisons.
 */

// ---------------------------------------------------------------------------
// Metric registry — each metric knows how to compute its actual value from
// the recorded data within a period. Add new initiatives/metrics here.
// ---------------------------------------------------------------------------

export interface MetricDef {
  key: string;
  label: string;
  shortLabel: string;
  unit: 'enterprises' | 'jobs' | 'ETB';
  description: string;
  /** Sum of the actual value produced by records created within [start, end]. */
  compute: (start: Date, end: Date) => Promise<number>;
}

export const GOAL_METRICS: MetricDef[] = [
  {
    key: 'enterprises',
    label: 'New Enterprises Registered',
    shortLabel: 'Enterprises',
    unit: 'enterprises',
    description: 'Count of small enterprise (MSE) records submitted in the period',
    compute: (start, end) =>
      db.smallEnterprise.count({ where: { createdAt: { gte: start, lte: end } } }),
  },
  {
    key: 'employees',
    label: 'Jobs Created',
    shortLabel: 'Jobs',
    unit: 'jobs',
    description: 'Total male + female employees of enterprises registered in the period',
    compute: (start, end) =>
      db.smallEnterprise
        .aggregate({
          _sum: { maleEmployees: true, femaleEmployees: true },
          where: { createdAt: { gte: start, lte: end } },
        })
        .then((r) => (r._sum.maleEmployees ?? 0) + (r._sum.femaleEmployees ?? 0)),
  },
  {
    key: 'femaleEmployees',
    label: 'Jobs Created for Women',
    shortLabel: 'Women jobs',
    unit: 'jobs',
    description: 'Female employees of enterprises registered in the period',
    compute: (start, end) =>
      db.smallEnterprise
        .aggregate({ _sum: { femaleEmployees: true }, where: { createdAt: { gte: start, lte: end } } })
        .then((r) => r._sum.femaleEmployees ?? 0),
  },
  {
    key: 'capital',
    label: 'Start-up Capital Mobilized',
    shortLabel: 'Capital',
    unit: 'ETB',
    description: 'Sum of start-up capital (ETB) of enterprises registered in the period',
    compute: (start, end) =>
      db.smallEnterprise
        .aggregate({ _sum: { startupCapital: true }, where: { createdAt: { gte: start, lte: end } } })
        .then((r) => r._sum.startupCapital ?? 0),
  },
];

export function getMetric(key: string): MetricDef | undefined {
  return GOAL_METRICS.find((m) => m.key === key);
}

export const PERIOD_TYPES = ['weekly', 'monthly', 'yearly'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export function isPeriodType(v: string): v is PeriodType {
  return (PERIOD_TYPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Period helpers — compute the [start, end] range for a period of the given
// type containing the reference date. Weeks run Monday–Sunday (Ethiopian
// government work week), months and years use the Gregorian calendar.
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

/** Monday-start week containing the reference date. */
function weekRange(ref: Date): { start: Date; end: Date } {
  const start = startOfDay(ref);
  const day = start.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end: endOfDay(end) };
}

function monthRange(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { start: startOfDay(start), end: endOfDay(end) };
}

function yearRange(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), 0, 1);
  const end = new Date(ref.getFullYear(), 11, 31);
  return { start: startOfDay(start), end: endOfDay(end) };
}

export function periodRange(periodType: PeriodType, ref: Date): { start: Date; end: Date } {
  switch (periodType) {
    case 'weekly':
      return weekRange(ref);
    case 'monthly':
      return monthRange(ref);
    case 'yearly':
      return yearRange(ref);
  }
}

/** The immediately preceding period of the same type (for trend comparison). */
function previousPeriodRange(periodType: PeriodType, ref: Date): { start: Date; end: Date } {
  const prevRef = new Date(ref);
  switch (periodType) {
    case 'weekly':
      prevRef.setDate(prevRef.getDate() - 7);
      break;
    case 'monthly':
      prevRef.setMonth(prevRef.getMonth() - 1);
      break;
    case 'yearly':
      prevRef.setFullYear(prevRef.getFullYear() - 1);
      break;
  }
  return periodRange(periodType, prevRef);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Human label for a period, e.g. "Nov 24 – Nov 30, 2026", "November 2026", "2026". */
export function periodLabel(periodType: PeriodType, start: Date, end: Date): string {
  const y = start.getFullYear();
  if (periodType === 'yearly') return String(y);
  if (periodType === 'monthly') return `${MONTHS[start.getMonth()]} ${y}`;
  const fmt = (d: Date) =>
    `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Achievement analysis — real-time progress, percentage achievement, pace
// comparison against elapsed time, and trend vs the previous period.
// ---------------------------------------------------------------------------

export interface GoalProgress {
  actual: number;
  achievementPct: number; // actual / target * 100
  remaining: number; // max(target - actual, 0)
  pacePct: number; // % of the period that has elapsed (0 before start, 100 after end)
  expectedByNow: number; // target * pace
  paceDelta: number; // achievementPct - pacePct (positive = ahead of schedule)
  status: 'upcoming' | 'onTrack' | 'behind' | 'achieved' | 'missed';
  daysLeft: number; // days remaining in the period (0 when ended)
  prevActual: number | null;
  trendPct: number | null; // change vs previous period, % (null when no baseline)
  label: string;
}

export async function analyzeGoal(goal: {
  metric: string;
  periodType: string;
  periodStart: Date;
  periodEnd: Date;
  targetValue: number;
}): Promise<GoalProgress> {
  const metric = getMetric(goal.metric);
  const periodType: PeriodType = isPeriodType(goal.periodType) ? goal.periodType : 'monthly';
  const start = new Date(goal.periodStart);
  const end = new Date(goal.periodEnd);
  const now = new Date();
  const target = goal.targetValue || 0;

  const actual = metric ? await metric.compute(start, end) : 0;
  const achievementPct = target > 0 ? Math.min((actual / target) * 100, 999) : 0;

  const totalMs = Math.max(end.getTime() - start.getTime(), 1);
  const elapsedMs = Math.min(Math.max(now.getTime() - start.getTime(), 0), totalMs);
  const pacePct = (elapsedMs / totalMs) * 100;
  const expectedByNow = (target * pacePct) / 100;
  const paceDelta = achievementPct - pacePct;

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(Math.ceil((end.getTime() - now.getTime()) / msPerDay), 0);

  let status: GoalProgress['status'];
  if (now < start) status = 'upcoming';
  else if (actual >= target && target > 0) status = 'achieved';
  else if (now > end) status = 'missed';
  // 10-point tolerance window around the elapsed-time pace
  else if (paceDelta >= -10) status = 'onTrack';
  else status = 'behind';

  const prev = previousPeriodRange(periodType, start);
  const prevActual = metric ? await metric.compute(prev.start, prev.end) : 0;
  const trendPct = prevActual > 0 ? ((actual - prevActual) / prevActual) * 100 : null;

  return {
    actual,
    achievementPct: Math.round(achievementPct * 10) / 10,
    remaining: Math.max(target - actual, 0),
    pacePct: Math.round(pacePct),
    expectedByNow,
    paceDelta: Math.round(paceDelta * 10) / 10,
    status,
    daysLeft,
    prevActual,
    trendPct: trendPct === null ? null : Math.round(trendPct * 10) / 10,
    label: periodLabel(periodType, start, end),
  };
}
