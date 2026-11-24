/**
 * Small Enterprise (MSE) Registration & Performance Monitoring — shared
 * pure helpers. No Prisma imports here, so client components can use it.
 *
 * Establishment status lifecycle tracked for every SME:
 *   REGISTERED → FULLY_LEGALIZED → AWAITING_OPERATION → OPERATIONAL
 *
 * Establishment targets are set at CITY, SUB_CITY or WOREDA level for a
 * monthly / quarterly / yearly period; performance (registered vs target,
 * achievement rate, pending SMEs, operational progress) is computed from
 * the SmallEnterprise records per administrative level.
 */

// ---------------------------------------------------------------------------
// Establishment status registry
// ---------------------------------------------------------------------------

export const SME_STATUSES = [
  'REGISTERED',
  'FULLY_LEGALIZED',
  'AWAITING_OPERATION',
  'OPERATIONAL',
] as const;

export type SmeStatus = (typeof SME_STATUSES)[number];

export interface SmeStatusMeta {
  key: SmeStatus;
  label: string;
  /** Short explanation shown in pickers & dashboards. */
  description: string;
  /** Tailwind classes for badges. */
  badgeClass: string;
  /** Dot / chart color (hex). */
  color: string;
}

export const SME_STATUS_META: Record<SmeStatus, SmeStatusMeta> = {
  REGISTERED: {
    key: 'REGISTERED',
    label: 'Registered',
    description: 'Registered with the office — legalization not yet completed',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    color: '#64748b',
  },
  FULLY_LEGALIZED: {
    key: 'FULLY_LEGALIZED',
    label: 'Fully Legalized',
    description: 'Fully legalized (license issued) — operation not started',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    color: '#2563eb',
  },
  AWAITING_OPERATION: {
    key: 'AWAITING_OPERATION',
    label: 'Awaiting Operation',
    description: 'Legalized and waiting to start operation (premises, inputs, ...)',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    color: '#d97706',
  },
  OPERATIONAL: {
    key: 'OPERATIONAL',
    label: 'Operational',
    description: 'Fully operational and producing / trading',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    color: '#059669',
  },
};

export function isSmeStatus(v: unknown): v is SmeStatus {
  return typeof v === 'string' && (SME_STATUSES as readonly string[]).includes(v);
}

/** Statuses that count as "pending" — not yet operational. */
export function isPendingStatus(v: string): boolean {
  return v !== 'OPERATIONAL';
}

// ---------------------------------------------------------------------------
// Target levels (administrative hierarchy: city → sub-city → woreda)
// ---------------------------------------------------------------------------

export const SME_TARGET_LEVELS = ['CITY', 'SUB_CITY', 'WOREDA'] as const;
export type SmeTargetLevel = (typeof SME_TARGET_LEVELS)[number];

export function isSmeTargetLevel(v: unknown): v is SmeTargetLevel {
  return typeof v === 'string' && (SME_TARGET_LEVELS as readonly string[]).includes(v);
}

/** Human label for the scope of a target / performance row. */
export function smeTargetScopeLabel(
  level: string,
  subCity?: string | null,
  area?: string | null
): string {
  switch (level) {
    case 'CITY':
      return 'City-wide (all sub-cities)';
    case 'SUB_CITY':
      return subCity ? `${subCity} Sub-City` : 'Sub-city';
    case 'WOREDA':
      return subCity && area ? `${area} (${subCity})` : area || 'Woreda';
    default:
      return level;
  }
}

// ---------------------------------------------------------------------------
// Period helpers — monthly / quarterly / yearly periods containing a
// reference date. Weeks are not used for establishment planning.
// ---------------------------------------------------------------------------

export const SME_PERIOD_TYPES = ['monthly', 'quarterly', 'yearly'] as const;
export type SmePeriodType = (typeof SME_PERIOD_TYPES)[number];

export function isSmePeriodType(v: unknown): v is SmePeriodType {
  return typeof v === 'string' && (SME_PERIOD_TYPES as readonly string[]).includes(v);
}

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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const QUARTERS = ['Q1 (Jan – Mar)', 'Q2 (Apr – Jun)', 'Q3 (Jul – Sep)', 'Q4 (Oct – Dec)'];

/** [start, end] of the monthly / quarterly / yearly period containing `ref`. */
export function smePeriodRange(periodType: SmePeriodType, ref: Date): { start: Date; end: Date } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (periodType) {
    case 'monthly':
      return { start: startOfDay(new Date(y, m, 1)), end: endOfDay(new Date(y, m + 1, 0)) };
    case 'quarterly': {
      const q = Math.floor(m / 3); // 0..3
      return { start: startOfDay(new Date(y, q * 3, 1)), end: endOfDay(new Date(y, q * 3 + 3, 0)) };
    }
    case 'yearly':
      return { start: startOfDay(new Date(y, 0, 1)), end: endOfDay(new Date(y, 11, 31)) };
  }
}

/** Human label for a period, e.g. "November 2026", "Q4 (Oct – Dec) 2026", "2026". */
export function smePeriodLabel(periodType: SmePeriodType, start: Date, end: Date): string {
  const y = start.getFullYear();
  if (periodType === 'yearly') return String(y);
  if (periodType === 'monthly') return `${MONTHS[start.getMonth()]} ${y}`;
  return `${QUARTERS[Math.floor(start.getMonth() / 3)]} ${y}`;
}

/** Which fraction (0–100) of the period has elapsed as of `now`. */
export function smePeriodPace(start: Date, end: Date, now: Date = new Date()): number {
  const total = Math.max(end.getTime() - start.getTime(), 1);
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  return Math.round((elapsed / total) * 100);
}

/** Overall standing of one unit against its period target. */
export type SmeUnitStatus =
  | 'no_target'
  | 'upcoming'
  | 'achieved'
  | 'on_track'
  | 'behind'
  | 'missed';

export function smeUnitStatus(
  target: number,
  actual: number,
  start: Date,
  end: Date,
  now: Date = new Date()
): SmeUnitStatus {
  if (target <= 0) return 'no_target';
  if (now < start) return 'upcoming';
  if (actual >= target) return 'achieved';
  if (now > end) return 'missed';
  const pace = smePeriodPace(start, end, now);
  const achievementPct = (actual / target) * 100;
  // 10-point tolerance window around the elapsed-time pace
  return achievementPct >= pace - 10 ? 'on_track' : 'behind';
}

export const SME_UNIT_STATUS_META: Record<SmeUnitStatus, { label: string; badgeClass: string }> = {
  no_target: { label: 'No target set', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  upcoming: { label: 'Upcoming', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  achieved: { label: 'Achieved', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  on_track: { label: 'On track', badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
  behind: { label: 'Behind', badgeClass: 'bg-red-50 text-red-700 border-red-200' },
  missed: { label: 'Missed', badgeClass: 'bg-orange-50 text-orange-700 border-orange-200' },
};
