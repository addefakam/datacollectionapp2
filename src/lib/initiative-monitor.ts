/**
 * Initiative Implementation & Performance Monitoring — analysis engine.
 *
 * Pure functions over plain data (Prisma rows serialized to JSON), so the
 * same computations run on the server (/api/initiatives/stats) and in the
 * client components. Everything the module promises is derived here:
 * target vs. actual attainment, performance gaps, delays against the
 * expected fully-operational date, completion rates and reporting
 * compliance (continuous follow-up).
 *
 * No Prisma import on purpose — keep this file client-safe.
 */

// ---------- lifecycle ----------

export const INITIATIVE_STATUSES = [
  'PROPOSED',
  'APPROVED',
  'IN_PROGRESS',
  'FULLY_OPERATIONAL',
  'ON_HOLD',
  'CANCELLED',
] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export interface StatusStyle {
  label: string;
  /** Tailwind classes for the status badge. */
  badge: string;
  /** Tailwind classes for a solid chip/dot. */
  dot: string;
  /** Tailwind classes for the lifecycle progress bar. */
  bar: string;
}

export const STATUS_CONFIG: Record<string, StatusStyle> = {
  PROPOSED: {
    label: 'Proposed',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
    bar: 'bg-slate-400',
  },
  APPROVED: {
    label: 'Approved',
    badge: 'bg-violet-50 text-violet-700 border-violet-300',
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    badge: 'bg-amber-50 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
  },
  FULLY_OPERATIONAL: {
    label: 'Fully Operational',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
  },
  ON_HOLD: {
    label: 'On Hold',
    badge: 'bg-orange-50 text-orange-800 border-orange-300',
    dot: 'bg-orange-500',
    bar: 'bg-orange-400',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-rose-50 text-rose-700 border-rose-300',
    dot: 'bg-rose-500',
    bar: 'bg-rose-400',
  },
};

export function statusStyle(status: string): StatusStyle {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.PROPOSED;
}

export const INITIATIVE_CATEGORIES = [
  'Infrastructure',
  'Social Services',
  'Economic Development',
  'Environment',
  'Governance',
  'Other',
];

export const TARGET_PERIOD_TYPES = [
  'total',
  'yearly',
  'quarterly',
  'monthly',
  'weekly',
  'daily',
];

export const PERIOD_LABELS: Record<string, string> = {
  total: 'Project total',
  yearly: 'Yearly',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  weekly: 'Weekly',
  daily: 'Daily',
};

// ---------- plain-data shapes (what the API returns) ----------

export interface TargetDTO {
  id: string;
  metric: string;
  unit: string | null;
  targetValue: number;
  periodType: string;
  dueDate: string | null;
  status: string;
}

export interface ReportDTO {
  id: string;
  targetId: string | null;
  reportDate: string;
  activities: string;
  achievedValue: number | null;
  challenges: string | null;
  supportNeeded: string | null;
  reportedByName: string | null;
  createdAt: string;
}

export interface TargetAnalysis {
  target: TargetDTO;
  achieved: number;
  attainmentPct: number | null; // null when targetValue is 0
  gap: number; // remaining quantity to reach the target (>= 0)
  met: boolean;
  overdue: boolean; // dueDate passed and target not met
}

export interface InitiativeAnalysis {
  /** Quantity still missing to reach all ACTIVE targets. */
  totalTarget: number;
  achievedTotal: number;
  attainmentPct: number | null;
  /** 0–100 progress used for bars (attainment capped at 100). */
  progressPct: number;
  /** Positive = behind plan (days past the expected fully-operational date). */
  delayDays: number;
  delayed: boolean;
  /** % of the establishment → expected-operational window already elapsed. */
  timelinePct: number | null;
  fullyOperational: boolean;
  lastReportDate: string | null;
  daysSinceLastReport: number | null;
  reportsLast7Days: number;
  reportDueToday: boolean; // no report for today (or yesterday) yet
  targets: TargetAnalysis[];
  metTargets: number;
  activeTargets: number;
}

// ---------- date helpers ----------

export function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Parse "2026-11-24" (or ISO) into UTC midnight — reports are day-based. */
export function utcMidnight(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const s = String(value).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ---------- analysis ----------

/**
 * Analyze one initiative.
 *
 * Reports whose targetId is null count toward the initiative's sole ACTIVE
 * target when there is exactly one (the common case); with several targets
 * an unassigned achieved value can not be attributed, so it is tracked
 * separately as `unassignedAchieved` — the UI asks the reporter to pick a
 * target for such days.
 */
export function analyzeInitiative(
  initiative: { status: string; establishmentDate: string | null; expectedOperationalDate: string | null; operationalDate: string | null },
  targets: TargetDTO[],
  reports: ReportDTO[]
): InitiativeAnalysis {
  const activeTargets = targets.filter((t) => t.status === 'ACTIVE');
  const today = todayUtc();

  // achieved value grouped by target
  const byTarget = new Map<string, number>();
  let unassignedAchieved = 0;
  for (const r of reports) {
    if (r.achievedValue == null || !Number.isFinite(r.achievedValue)) continue;
    if (r.targetId && activeTargets.some((t) => t.id === r.targetId)) {
      byTarget.set(r.targetId, (byTarget.get(r.targetId) ?? 0) + r.achievedValue);
    } else {
      unassignedAchieved += r.achievedValue;
    }
  }
  // unassigned values fall back to the sole active target
  if (unassignedAchieved !== 0 && activeTargets.length === 1) {
    const only = activeTargets[0].id;
    byTarget.set(only, (byTarget.get(only) ?? 0) + unassignedAchieved);
    unassignedAchieved = 0;
  }

  const targetAnalyses: TargetAnalysis[] = activeTargets.map((t) => {
    const achieved = byTarget.get(t.id) ?? 0;
    const attainmentPct = t.targetValue > 0 ? (achieved / t.targetValue) * 100 : null;
    const met = t.targetValue > 0 && achieved >= t.targetValue;
    const overdue =
      !!t.dueDate && !met && utcMidnight(t.dueDate) < today;
    return {
      target: t,
      achieved,
      attainmentPct,
      gap: Math.max(0, t.targetValue - achieved),
      met,
      overdue,
    };
  });

  const totalTarget = activeTargets.reduce((s, t) => s + t.targetValue, 0);
  const achievedTotal = activeTargets.reduce((s, t) => s + (byTarget.get(t.id) ?? 0), 0);
  const attainmentPct = totalTarget > 0 ? (achievedTotal / totalTarget) * 100 : null;

  const fullyOperational = initiative.status === 'FULLY_OPERATIONAL';

  // timeline: establishment → expected fully-operational
  let timelinePct: number | null = null;
  if (initiative.establishmentDate && initiative.expectedOperationalDate) {
    const start = utcMidnight(initiative.establishmentDate);
    const end = utcMidnight(initiative.expectedOperationalDate);
    if (end > start) {
      timelinePct = Math.min(100, Math.max(0, (daysBetween(start, today) / daysBetween(start, end)) * 100));
    } else {
      timelinePct = 100;
    }
  }

  // delay: past the expected fully-operational date and not there yet
  let delayDays = 0;
  if (
    initiative.expectedOperationalDate &&
    !fullyOperational &&
    initiative.status !== 'CANCELLED' &&
    utcMidnight(initiative.expectedOperationalDate) < today
  ) {
    delayDays = daysBetween(utcMidnight(initiative.expectedOperationalDate), today);
  }

  // reporting compliance (continuous follow-up)
  let lastReportDate: string | null = null;
  let reportsLast7Days = 0;
  if (reports.length > 0) {
    const sorted = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    lastReportDate = sorted[0].reportDate;
    for (const r of reports) {
      if (daysBetween(utcMidnight(r.reportDate), today) <= 6) reportsLast7Days += 1;
    }
  }
  const daysSinceLastReport =
    lastReportDate != null ? daysBetween(utcMidnight(lastReportDate), today) : null;
  const reportDueToday =
    initiative.status !== 'CANCELLED' &&
    (daysSinceLastReport == null || daysSinceLastReport >= 1);

  return {
    totalTarget,
    achievedTotal: achievedTotal + unassignedAchieved,
    attainmentPct,
    progressPct: fullyOperational ? 100 : Math.min(100, Math.max(0, attainmentPct ?? 0)),
    delayDays,
    delayed: delayDays > 0,
    timelinePct,
    fullyOperational,
    lastReportDate,
    daysSinceLastReport,
    reportsLast7Days,
    reportDueToday,
    targets: targetAnalyses,
    metTargets: targetAnalyses.filter((t) => t.met).length,
    activeTargets: activeTargets.length,
  };
}

/** Aggregation of several analyzed initiatives for one department / sub-city / the whole city. */
export interface GroupPerformance {
  group: string;
  initiatives: number;
  fullyOperational: number;
  completionRatePct: number; // fully operational / total
  totalTarget: number;
  achievedTotal: number;
  attainmentPct: number | null;
  gap: number;
  delayedCount: number;
  onTrackCount: number;
  reportsLast7Days: number;
  /** Departments that have not reported for >= 2 days today (accountability). */
  behindOnReports: number;
  avgDaysSinceReport: number | null;
}

export function summarizeGroup(
  group: string,
  items: { status: string; analysis: InitiativeAnalysis }[]
): GroupPerformance {
  const n = items.length;
  const operational = items.filter((i) => i.analysis.fullyOperational).length;
  const totalTarget = items.reduce((s, i) => s + i.analysis.totalTarget, 0);
  const achievedTotal = items.reduce((s, i) => s + i.analysis.achievedTotal, 0);
  const withReports = items.filter((i) => i.analysis.daysSinceLastReport != null);
  return {
    group,
    initiatives: n,
    fullyOperational: operational,
    completionRatePct: n > 0 ? (operational / n) * 100 : 0,
    totalTarget,
    achievedTotal,
    attainmentPct: totalTarget > 0 ? (achievedTotal / totalTarget) * 100 : null,
    gap: Math.max(0, totalTarget - achievedTotal),
    delayedCount: items.filter((i) => i.analysis.delayed).length,
    onTrackCount: items.filter(
      (i) =>
        !i.analysis.delayed &&
        !i.analysis.fullyOperational &&
        i.status !== 'CANCELLED'
    ).length,
    reportsLast7Days: items.reduce((s, i) => s + i.analysis.reportsLast7Days, 0),
    behindOnReports: items.filter((i) => i.analysis.reportDueToday).length,
    avgDaysSinceReport:
      withReports.length > 0
        ? withReports.reduce((s, i) => s + (i.analysis.daysSinceLastReport ?? 0), 0) / withReports.length
        : null,
  };
}

/** Round a percent for display (1 decimal). */
export function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 10) / 10}%`;
}
