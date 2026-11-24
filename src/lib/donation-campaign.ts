/**
 * Bussa Goonofaa Charity — Donation Campaign analysis engine.
 *
 * Pure functions over plain data (Prisma rows serialized to JSON), so the
 * same computations run on the server (/api/donation-campaigns*) and in the
 * client components. Everything the module promises is derived here:
 *
 *  - campaign goal vs. collected (cash + in-kind value), attainment %, gap
 *  - pace: expected progress by elapsed time vs. actual attainment
 *  - office-wise breakdown: minimum amount distributed to each office,
 *    what it collected, its gap and its status (achieved / on track /
 *    behind / missed), plus offices that collect without an assignment
 *  - reporting compliance: last report age per office — the accountability
 *    view for the coordination office
 *
 * No Prisma import on purpose — keep this file client-safe.
 */

// ---------- lifecycle ----------

export const CAMPAIGN_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface CampaignStatusStyle {
  label: string;
  /** Tailwind classes for the status badge. */
  badge: string;
  /** Tailwind classes for a solid chip. */
  chip: string;
}

export const CAMPAIGN_STATUS_CONFIG: Record<string, CampaignStatusStyle> = {
  ACTIVE: {
    label: 'Active',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    chip: 'bg-emerald-500',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-sky-50 text-sky-700 border-sky-300',
    chip: 'bg-sky-500',
  },
  CANCELLED: {
    label: 'Cancelled',
    badge: 'bg-rose-50 text-rose-700 border-rose-300',
    chip: 'bg-rose-500',
  },
};

export function campaignStatusStyle(status: string): CampaignStatusStyle {
  return CAMPAIGN_STATUS_CONFIG[status] ?? CAMPAIGN_STATUS_CONFIG.ACTIVE;
}

// Office progress states — how an office stands against its minimum amount.
export type OfficeState =
  | 'upcoming' // campaign has not started yet
  | 'achieved' // reached its minimum amount
  | 'onTrack' // behind the goal but within the elapsed-time pace (10-point tolerance)
  | 'behind' // lagging the pace expected by now
  | 'missed' // campaign deadline passed without reaching the minimum
  | 'unassigned'; // collecting without a distributed minimum — counts toward the total goal

export const OFFICE_STATE_CONFIG: Record<OfficeState, { label: string; badge: string }> = {
  upcoming: { label: 'Upcoming', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  achieved: { label: 'Achieved', badge: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  onTrack: { label: 'On Track', badge: 'bg-sky-50 text-sky-700 border-sky-300' },
  behind: { label: 'Behind', badge: 'bg-amber-50 text-amber-800 border-amber-300' },
  missed: { label: 'Missed', badge: 'bg-rose-50 text-rose-700 border-rose-300' },
  unassigned: { label: 'No Minimum Set', badge: 'bg-violet-50 text-violet-700 border-violet-300' },
};

// ---------- plain-data shapes (what the API returns) ----------

export interface CampaignDTO {
  id: string;
  name: string;
  description: string | null;
  totalGoal: number;
  currency: string;
  kindNote: string | null;
  startDate: string;
  deadline: string;
  status: string;
  createdByName: string | null;
  createdAt: string;
}

export interface AssignmentDTO {
  id: string;
  campaignId: string;
  departmentId: string;
  departmentName: string;
  minimumAmount: number;
  note: string | null;
}

export interface DonationDTO {
  id: string;
  campaignId: string;
  departmentId: string;
  departmentName: string;
  reportDate: string;
  cashAmount: number;
  inKindValue: number;
  inKindDetails: string | null;
  donorsCount: number;
  notes: string | null;
  reportedByName: string | null;
  createdAt: string;
}

// ---------- analysis ----------

export interface OfficeAnalysis {
  departmentId: string;
  departmentName: string;
  /** false when the office collects donations without a distributed minimum */
  assigned: boolean;
  minimumAmount: number;
  /** coordination note attached to the assignment (how to collect, focus donors, …) */
  note: string | null;
  cash: number;
  inKind: number;
  collected: number;
  attainmentPct: number | null; // null for unassigned offices
  gap: number; // remaining amount to its own minimum (0 when achieved / unassigned)
  expectedByNow: number; // minimum * elapsed pace
  paceDelta: number | null; // attainmentPct - pacePct (positive = ahead of schedule)
  state: OfficeState;
  entries: number; // achievement records submitted
  donors: number; // donors reached
  lastReportDate: string | null;
  daysSinceLastReport: number | null;
  /** Has not submitted for >= 2 days while the campaign runs — accountability flag */
  reportDue: boolean;
}

export interface CampaignAnalysis {
  cash: number;
  inKind: number;
  collected: number; // cash + in-kind value
  attainmentPct: number | null;
  gap: number; // remaining amount to the campaign goal
  progressPct: number; // 0–100 bar (attainment capped at 100)
  pacePct: number; // % of the start → deadline window already elapsed (0–100)
  expectedByNow: number; // totalGoal * pace
  paceDelta: number | null;
  state: Exclude<OfficeState, 'unassigned'>;
  daysLeft: number; // days until the deadline (0 once past)
  entries: number;
  donors: number;
  offices: OfficeAnalysis[];
  assignedOffices: number;
  officesAchieved: number;
  officesBehind: number;
  officesReportDue: number;
  unassignedCollected: number; // donations from offices without an assignment
}

export function utcMidnight(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const s = String(value).slice(0, 10);
  return new Date(`${s}T00:00:00.000Z`);
}

/** % of the campaign window already elapsed, 0–100 (clamped both sides). */
function elapsedPct(startDate: string, deadline: string, now: Date): number {
  const start = utcMidnight(startDate).getTime();
  const end = utcMidnight(deadline).getTime();
  if (end <= start) return now.getTime() >= end ? 100 : 0;
  const elapsed = Math.min(Math.max(now.getTime() - start, 0), end - start);
  return ((now.getTime() - start) / (end - start)) * 100;
}

/**
 * Analyze one campaign from its assignments and donation entries.
 *
 * Accepts both serialized JSON (ISO strings) and fresh Prisma rows (Date
 * objects) for the date fields, so server routes can pass rows through.
 *
 * Donations from offices that were not assigned a minimum still count
 * toward the campaign goal (tracked separately as `unassignedCollected`
 * and shown at the end of the office table) — extra collections help the
 * total even when the office had no distributed amount.
 */
export function analyzeCampaign(
  campaign: { startDate: string | Date; deadline: string | Date; totalGoal: number; status: string },
  assignments: { departmentId: string; departmentName: string; minimumAmount: number; note?: string | null }[],
  donations: {
    departmentId: string;
    departmentName?: string | null;
    reportDate: string | Date;
    cashAmount: number;
    inKindValue: number;
    donorsCount: number;
  }[]
): CampaignAnalysis {
  const now = new Date();
  const nowIso = now.toISOString();
  const startIso = typeof campaign.startDate === 'string' ? campaign.startDate : campaign.startDate.toISOString();
  const deadlineIso = typeof campaign.deadline === 'string' ? campaign.deadline : campaign.deadline.toISOString();
  const deadlinePassed = utcMidnight(deadlineIso) < utcMidnight(nowIso);
  const notStarted = utcMidnight(nowIso) < utcMidnight(startIso);
  const pace = elapsedPct(startIso, deadlineIso, now);
  const cancelled = campaign.status === 'CANCELLED';
  const completed = campaign.status === 'COMPLETED';

  // totals
  const cash = donations.reduce((s, d) => s + (d.cashAmount || 0), 0);
  const inKind = donations.reduce((s, d) => s + (d.inKindValue || 0), 0);
  const collected = cash + inKind;
  const donors = donations.reduce((s, d) => s + (d.donorsCount || 0), 0);
  const attainmentPct = campaign.totalGoal > 0 ? (collected / campaign.totalGoal) * 100 : null;
  const expectedByNow = (campaign.totalGoal * pace) / 100;
  const paceDelta = attainmentPct == null ? null : attainmentPct - pace;

  // group entries by office
  const byOffice = new Map<
    string,
    { name: string; cash: number; inKind: number; donors: number; entries: number; lastDate: string | null }
  >();
  for (const d of donations) {
    const reportIso = typeof d.reportDate === 'string' ? d.reportDate : d.reportDate.toISOString();
    const bucket = byOffice.get(d.departmentId) ?? {
      name: d.departmentName || 'Unlisted office',
      cash: 0,
      inKind: 0,
      donors: 0,
      entries: 0,
      lastDate: null,
    };
    bucket.cash += d.cashAmount || 0;
    bucket.inKind += d.inKindValue || 0;
    bucket.donors += d.donorsCount || 0;
    bucket.entries += 1;
    if (bucket.lastDate == null || reportIso > bucket.lastDate) bucket.lastDate = reportIso;
    byOffice.set(d.departmentId, bucket);
  }

  const officeAnalyses: OfficeAnalysis[] = assignments.map((a) => {
    const bucket = byOffice.get(a.departmentId);
    const officeCash = bucket?.cash ?? 0;
    const officeInKind = bucket?.inKind ?? 0;
    const officeCollected = officeCash + officeInKind;
    const attainmentPct = a.minimumAmount > 0 ? (officeCollected / a.minimumAmount) * 100 : null;
    const gap = Math.max(0, a.minimumAmount - officeCollected);
    const expectedByNow = (a.minimumAmount * pace) / 100;
    const paceDelta = attainmentPct == null ? null : attainmentPct - pace;

    let state: OfficeState;
    if (notStarted) state = 'upcoming';
    else if (cancelled) state = 'behind'; // inactive — shown as behind, frozen by status
    else if (a.minimumAmount > 0 && officeCollected >= a.minimumAmount) state = 'achieved';
    else if (deadlinePassed || completed) state = 'missed';
    else if (paceDelta != null && paceDelta >= -10) state = 'onTrack';
    else state = 'behind';

    const daysSinceLastReport =
      bucket?.lastDate != null
        ? Math.floor((utcMidnight(nowIso).getTime() - utcMidnight(bucket.lastDate).getTime()) / 86400000)
        : null;

    return {
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      assigned: true,
      minimumAmount: a.minimumAmount,
      note: a.note ?? null,
      cash: officeCash,
      inKind: officeInKind,
      collected: officeCollected,
      attainmentPct,
      gap,
      expectedByNow,
      paceDelta,
      state,
      entries: bucket?.entries ?? 0,
      donors: bucket?.donors ?? 0,
      lastReportDate: bucket?.lastDate ?? null,
      daysSinceLastReport,
      reportDue: !notStarted && !completed && (daysSinceLastReport == null || daysSinceLastReport >= 2),
    };
  });

  // donations from offices without a distributed minimum
  const assignedIds = new Set(assignments.map((a) => a.departmentId));
  let unassignedCollected = 0;
  const unassignedOffices: OfficeAnalysis[] = [];
  for (const [departmentId, bucket] of byOffice) {
    if (assignedIds.has(departmentId)) continue;
    const officeCollected = bucket.cash + bucket.inKind;
    unassignedCollected += officeCollected;
    const daysSinceLastReport =
      bucket.lastDate != null
        ? Math.floor((utcMidnight(nowIso).getTime() - utcMidnight(bucket.lastDate).getTime()) / 86400000)
        : null;
    unassignedOffices.push({
      departmentId,
      departmentName: bucket.name,
      assigned: false,
      minimumAmount: 0,
      note: null,
      cash: bucket.cash,
      inKind: bucket.inKind,
      collected: officeCollected,
      attainmentPct: null,
      gap: 0,
      expectedByNow: 0,
      paceDelta: null,
      state: 'unassigned',
      entries: bucket.entries,
      donors: bucket.donors,
      lastReportDate: bucket.lastDate,
      daysSinceLastReport,
      reportDue: false,
    });
  }

  // campaign-level state
  let campaignState: CampaignAnalysis['state'];
  const goalMet = campaign.totalGoal > 0 && collected >= campaign.totalGoal;
  if (notStarted) campaignState = 'upcoming';
  else if (cancelled) campaignState = 'behind';
  else if (goalMet) campaignState = 'achieved';
  else if (deadlinePassed || completed) campaignState = 'missed';
  else if (paceDelta != null && paceDelta >= -10) campaignState = 'onTrack';
  else campaignState = 'behind';

  const allOffices = [...officeAnalyses, ...unassignedOffices];

  return {
    cash,
    inKind,
    collected,
    attainmentPct,
    gap: Math.max(0, campaign.totalGoal - collected),
    progressPct: goalMet ? 100 : Math.min(100, Math.max(0, attainmentPct ?? 0)),
    pacePct: Math.round(pace * 10) / 10,
    expectedByNow,
    paceDelta: paceDelta == null ? null : Math.round(paceDelta * 10) / 10,
    state: campaignState,
    daysLeft: Math.max(0, Math.ceil((utcMidnight(deadlineIso).getTime() - utcMidnight(nowIso).getTime()) / 86400000)),
    entries: donations.length,
    donors,
    offices: allOffices,
    assignedOffices: officeAnalyses.length,
    officesAchieved: officeAnalyses.filter((o) => o.state === 'achieved').length,
    officesBehind: officeAnalyses.filter((o) => o.state === 'behind' || o.state === 'missed').length,
    officesReportDue: allOffices.filter((o) => o.reportDue).length,
    unassignedCollected,
  };
}

// ---------- formatting helpers ----------

/** "ETB 12,500" / "12,500 ETB" style money text with thousand separators. */
export function money(value: number | null | undefined, currency = 'ETB'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  const formatted = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${formatted} ${currency}`;
}

/** Percent for display (1 decimal, em dash for null). */
export function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 10) / 10}%`;
}
