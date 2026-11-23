'use client';

import * as React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Coins,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Target,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types & client-side metric metadata (mirrors src/lib/goals.ts)
// ---------------------------------------------------------------------------

interface GoalProgress {
  actual: number;
  achievementPct: number;
  remaining: number;
  pacePct: number;
  expectedByNow: number;
  paceDelta: number;
  status: 'upcoming' | 'onTrack' | 'behind' | 'achieved' | 'missed';
  daysLeft: number;
  prevActual: number | null;
  trendPct: number | null;
  label: string;
}

interface Goal {
  id: string;
  module: string;
  metric: string;
  periodType: 'weekly' | 'monthly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  owner: string | null;
  status: string;
  progress: GoalProgress;
}

const METRICS = {
  enterprises: { label: 'New Enterprises Registered', unit: 'enterprises', icon: Store },
  employees: { label: 'Jobs Created', unit: 'jobs', icon: Users },
  femaleEmployees: { label: 'Jobs Created for Women', unit: 'jobs', icon: UserRound },
  capital: { label: 'Start-up Capital Mobilized', unit: 'ETB', icon: Coins },
} as const;

type MetricKey = keyof typeof METRICS;

const PERIOD_BADGE: Record<Goal['periodType'], string> = {
  weekly: 'bg-sky-100 text-sky-800 ring-sky-600/20',
  monthly: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
  yearly: 'bg-violet-100 text-violet-800 ring-violet-600/20',
};

const STATUS_CONFIG: Record<
  GoalProgress['status'],
  { label: string; chip: string; bar: string; pct: string }
> = {
  achieved: {
    label: 'Achieved',
    chip: 'bg-emerald-100 text-emerald-800 ring-emerald-600/25',
    bar: 'bg-brand-gradient',
    pct: 'text-emerald-700',
  },
  onTrack: {
    label: 'On Track',
    chip: 'bg-teal-100 text-teal-800 ring-teal-600/25',
    bar: 'bg-teal-500',
    pct: 'text-teal-700',
  },
  behind: {
    label: 'Behind Pace',
    chip: 'bg-amber-100 text-amber-800 ring-amber-600/25',
    bar: 'bg-amber-500',
    pct: 'text-amber-700',
  },
  missed: {
    label: 'Missed',
    chip: 'bg-red-100 text-red-700 ring-red-600/25',
    bar: 'bg-red-500',
    pct: 'text-red-600',
  },
  upcoming: {
    label: 'Upcoming',
    chip: 'bg-sky-100 text-sky-700 ring-sky-600/25',
    bar: 'bg-sky-400',
    pct: 'text-sky-700',
  },
};

const PERIOD_ORDER: Goal['periodType'][] = ['weekly', 'monthly', 'yearly'];
const PERIOD_SECTION_LABEL: Record<Goal['periodType'], string> = {
  weekly: 'Weekly Goals',
  monthly: 'Monthly Goals',
  yearly: 'Yearly Goals',
};

function formatValue(unit: 'enterprises' | 'jobs' | 'ETB', v: number): string {
  if (unit === 'ETB') return `ETB ${Math.round(v).toLocaleString()}`;
  const n = Math.round(v);
  const word = unit === 'enterprises' ? (n === 1 ? 'enterprise' : 'enterprises') : n === 1 ? 'job' : unit;
  return `${n.toLocaleString()} ${word}`;
}

/** Build the refDate payload for the API from the form's period-type inputs. */
function refDateFrom(periodType: string, value: string): string {
  if (periodType === 'weekly') return `${value}T12:00:00`;
  if (periodType === 'monthly') {
    const [y, m] = value.split('-').map(Number);
    return new Date(y, m - 1, 15).toISOString();
  }
  return new Date(Number(value), 6, 1).toISOString(); // mid-year for yearly
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentMonthString(): string {
  return todayString().slice(0, 7);
}

/** Derive the form's reference value from a stored periodStart (for editing). */
function refValueFrom(goal: Goal): string {
  const d = new Date(goal.periodStart);
  if (goal.periodType === 'weekly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (goal.periodType === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return String(d.getFullYear());
}

// ---------------------------------------------------------------------------
// Goal form dialog
// ---------------------------------------------------------------------------

interface GoalFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  editing: Goal | null;
}

function GoalForm({ open, onOpenChange, onSaved, editing }: GoalFormProps) {
  const { toast } = useToast();
  const [metric, setMetric] = React.useState<MetricKey>('enterprises');
  const [periodType, setPeriodType] = React.useState<Goal['periodType']>('monthly');
  const [refValue, setRefValue] = React.useState(currentMonthString());
  const [target, setTarget] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (editing) {
        setMetric(editing.metric as MetricKey);
        setPeriodType(editing.periodType);
        setRefValue(refValueFrom(editing));
        setTarget(String(editing.targetValue));
        setOwner(editing.owner ?? '');
      } else {
        setMetric('enterprises');
        setPeriodType('monthly');
        setRefValue(currentMonthString());
        setTarget('');
        setOwner('');
      }
    }
  }, [open, editing]);

  const years = React.useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetNum = Number(target);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      toast({ title: 'Invalid target', description: 'Enter a positive target value.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/goals/${editing.id}` : '/api/goals', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { targetValue: targetNum, owner }
            : { metric, periodType, refDate: refDateFrom(periodType, refValue), targetValue: targetNum, owner }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save goal');
      toast({
        title: editing ? 'Goal updated' : 'Goal set',
        description: editing
          ? 'The target was updated — progress recalculated.'
          : `${METRICS[metric].label} · ${periodType} target of ${targetNum.toLocaleString()}.`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        title: 'Could not save goal',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-700" />
            {editing ? 'Adjust Goal' : 'Set a New Goal'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the target value or the responsible office — progress recalculates instantly.'
              : 'Choose the initiative metric, the period and the target the sub-city aims to reach.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-metric">Metric</Label>
            <Select
              value={metric}
              onValueChange={(v) => setMetric(v as MetricKey)}
              disabled={!!editing}
            >
              <SelectTrigger id="goal-metric" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRICS) as MetricKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {METRICS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-period">Period</Label>
              <Select
                value={periodType}
                onValueChange={(v) => {
                  const t = v as Goal['periodType'];
                  setPeriodType(t);
                  setRefValue(t === 'weekly' ? todayString() : t === 'monthly' ? currentMonthString() : String(new Date().getFullYear()));
                }}
                disabled={!!editing}
              >
                <SelectTrigger id="goal-period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-ref">
                {periodType === 'weekly' ? 'Any day in the week' : periodType === 'monthly' ? 'Month' : 'Year'}
              </Label>
              {periodType === 'weekly' && (
                <Input
                  id="goal-ref"
                  type="date"
                  value={refValue}
                  onChange={(e) => setRefValue(e.target.value)}
                  disabled={!!editing}
                />
              )}
              {periodType === 'monthly' && (
                <Input
                  id="goal-ref"
                  type="month"
                  value={refValue}
                  onChange={(e) => setRefValue(e.target.value)}
                  disabled={!!editing}
                />
              )}
              {periodType === 'yearly' && (
                <Select value={refValue} onValueChange={setRefValue} disabled={!!editing}>
                  <SelectTrigger id="goal-ref" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-target">
              Target value ({METRICS[metric].unit === 'ETB' ? 'ETB' : METRICS[metric].unit})
            </Label>
            <Input
              id="goal-target"
              type="number"
              min="1"
              step={metric === 'capital' ? '1000' : '1'}
              placeholder={metric === 'capital' ? 'e.g., 500000' : 'e.g., 25'}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-owner">Responsible office (optional)</Label>
            <Input
              id="goal-owner"
              placeholder="e.g., Job Creation & Enterprise Development"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-brand-gradient text-white">
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Set Goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Goal card — progress bar with pace marker, achievement %, trend comparison
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onEdit: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  const p = goal.progress;
  const m = METRICS[goal.metric as MetricKey];
  const MetricIcon = m?.icon ?? Target;
  const sc = STATUS_CONFIG[p.status];
  const fill = Math.min(Math.max(p.achievementPct, p.actual > 0 ? 2 : 0), 100);
  const marker = Math.min(Math.max(p.pacePct, 0), 100);

  return (
    <Card className="card-lift gap-4 overflow-hidden py-5">
      <CardContent className="space-y-4 px-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-800/10 text-emerald-800">
              <MetricIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display truncate text-sm font-bold text-emerald-950">{m?.label ?? goal.metric}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                {p.label}
                {goal.owner && <span className="text-emerald-800/60">· {goal.owner}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1',
                PERIOD_BADGE[goal.periodType]
              )}
            >
              {goal.periodType}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', sc.chip)}>
              {sc.label}
            </span>
          </div>
        </div>

        {/* Achievement bar with pace marker */}
        <div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-900/10">
            <div
              className={cn('h-full rounded-full transition-all duration-500', sc.bar)}
              style={{ width: `${fill}%` }}
            />
            {/* Pace marker: where the target "should" be by today */}
            <div
              className="absolute top-0 h-full w-0.5 bg-emerald-950/45"
              style={{ left: `calc(${marker}% - 1px)` }}
              title={`Expected by now: ${Math.round(p.expectedByNow).toLocaleString()} (${p.pacePct}% of period elapsed)`}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {formatValue(m?.unit ?? 'jobs', p.actual)} of {formatValue(m?.unit ?? 'jobs', goal.targetValue)}
            </span>
            <span className={cn('font-semibold', sc.pct)}>{p.achievementPct}% achieved</span>
          </div>
        </div>

        {/* Analysis row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-emerald-900/[0.04] px-2.5 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="truncate text-xs font-bold text-emerald-950">{formatValue(m?.unit ?? 'jobs', p.remaining)}</p>
          </div>
          <div className="rounded-lg bg-emerald-900/[0.04] px-2.5 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Expected by now</p>
            <p className="truncate text-xs font-bold text-emerald-950">
              {formatValue(m?.unit ?? 'jobs', p.expectedByNow)}
              <span className="ml-1 font-medium text-muted-foreground">({p.pacePct}%)</span>
            </p>
          </div>
          <div className="rounded-lg bg-emerald-900/[0.04] px-2.5 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pace</p>
            <p
              className={cn(
                'truncate text-xs font-bold',
                p.paceDelta >= 0 ? 'text-emerald-700' : 'text-amber-700'
              )}
            >
              {p.status === 'upcoming'
                ? 'Not started'
                : p.status === 'achieved'
                  ? `Ahead by ${Math.round(p.paceDelta)} pts`
                  : p.paceDelta >= 0
                    ? `Ahead by ${Math.round(p.paceDelta)} pts`
                    : `Behind by ${Math.abs(Math.round(p.paceDelta))} pts`}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-900/[0.04] px-2.5 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {p.status === 'missed' || p.status === 'achieved' ? 'Period' : 'Days left'}
            </p>
            <p className="truncate text-xs font-bold text-emerald-950">
              {p.status === 'missed'
                ? 'Ended'
                : p.status === 'achieved'
                  ? 'Complete'
                  : p.status === 'upcoming'
                    ? 'Starts soon'
                    : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        {/* Trend vs previous period */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-900/10 pt-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            {p.status === 'upcoming' ? (
              <span>Period starts {p.label} — progress tracking begins automatically</span>
            ) : p.prevActual === null || p.trendPct === null ? (
              <span>
                Previous {goal.periodType}: {formatValue(m?.unit ?? 'jobs', p.prevActual ?? 0)} — no baseline yet
              </span>
            ) : (
              <span className="flex items-center gap-1">
                {p.trendPct >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={cn('font-semibold', p.trendPct >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {p.trendPct >= 0 ? '+' : ''}
                  {p.trendPct}%
                </span>
                <span>
                  vs previous {goal.periodType} ({formatValue(m?.unit ?? 'jobs', p.prevActual)})
                </span>
              </span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onEdit(goal)}
              title="Adjust target"
            >
              <Pencil className="h-3 w-3" />
              Adjust
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50"
              onClick={() => onDelete(goal)}
              title="Delete goal"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main view — summary strip, set-goal action, goals grouped by period
// ---------------------------------------------------------------------------

export default function GoalManager({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { toast } = useToast();
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Goal | null>(null);
  const [deleting, setDeleting] = React.useState<Goal | null>(null);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch('/api/goals', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load goals');
      setGoals(data.data ?? []);
    } catch (err) {
      if (!silent) {
        toast({
          title: 'Could not load goals',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Initial load + live refresh every 60 s (real-time progress tracking)
  React.useEffect(() => {
    load(true);
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Re-fetch when a new survey lands (parent bumps refreshTrigger)
  React.useEffect(() => {
    if (refreshTrigger > 0) load(true);
  }, [refreshTrigger, load]);

  const removeGoal = async () => {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/goals/${deleting.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete goal');
      toast({ title: 'Goal deleted', description: `${METRICS[deleting.metric as MetricKey]?.label ?? deleting.metric} · ${deleting.progress.label}` });
      setDeleting(null);
      load(true);
    } catch (err) {
      toast({
        title: 'Could not delete goal',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const summary = React.useMemo(() => {
    const started = goals.filter((g) => g.progress.status !== 'upcoming');
    const avg = started.length
      ? Math.round(started.reduce((s, g) => s + g.progress.achievementPct, 0) / started.length)
      : 0;
    return {
      total: goals.length,
      avg,
      good: goals.filter((g) => g.progress.status === 'achieved' || g.progress.status === 'onTrack').length,
      behind: goals.filter((g) => g.progress.status === 'behind' || g.progress.status === 'missed').length,
    };
  }, [goals]);

  const grouped = React.useMemo(() => {
    const map = new Map<Goal['periodType'], Goal[]>();
    for (const g of goals) {
      const list = map.get(g.periodType) ?? [];
      list.push(g);
      map.set(g.periodType, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.progress.status === 'achieved' ? 1 : 0) - (b.progress.status === 'achieved' ? 1 : 0) || (a.periodStart < b.periodStart ? 1 : -1));
    }
    return map;
  }, [goals]);

  return (
    <div className="animate-fade-up space-y-4">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-brand-gradient py-0 text-white shadow-lg shadow-emerald-900/20">
        <CardContent className="relative px-5 py-5 sm:px-6 sm:py-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-amber-300/20 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-50/80">
                <Target className="h-3.5 w-3.5" />
                Small Enterprise Initiative · Dhibayyuu Sub-City
              </p>
              <h2 className="font-display mt-1 text-xl font-extrabold sm:text-2xl">Goals &amp; Targets</h2>
              <p className="mt-1 max-w-xl text-xs text-emerald-50/85 sm:text-sm">
                Set weekly, monthly and yearly targets, then follow live progress, percentage achievement and
                pace comparisons against the recorded data.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => load()}
                disabled={refreshing}
                title="Refresh progress now (auto-refreshes every minute)"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                <span className="ml-1 hidden sm:inline">Refresh</span>
              </Button>
              <Button
                size="sm"
                className="bg-white text-emerald-800 shadow-md hover:bg-emerald-50"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New Goal
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active goals', value: summary.total, icon: Target, tone: 'text-emerald-800 bg-emerald-800/10' },
          { label: 'Avg achievement', value: `${summary.avg}%`, icon: Gauge, tone: 'text-teal-800 bg-teal-800/10' },
          { label: 'On track / achieved', value: summary.good, icon: TrendingUp, tone: 'text-emerald-700 bg-emerald-700/10' },
          { label: 'Behind / missed', value: summary.behind, icon: ArrowDownRight, tone: 'text-amber-700 bg-amber-700/10' },
        ].map((s) => (
          <Card key={s.label} className="card-lift gap-0 py-4">
            <CardContent className="flex items-center gap-3 px-4">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', s.tone)}>
                <s.icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-tight text-emerald-950">{s.value}</p>
                <p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Goals by period */}
      {loading ? (
        <Card className="items-center py-10 text-center">
          <CardContent className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <p className="text-sm text-muted-foreground">Loading goals…</p>
          </CardContent>
        </Card>
      ) : goals.length === 0 ? (
        <Card className="py-10 text-center">
          <CardContent className="flex flex-col items-center gap-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-800/10 text-emerald-800">
              <Target className="h-6 w-6" />
            </span>
            <p className="font-display text-base font-bold text-emerald-950">No goals set yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Officials can set weekly, monthly or yearly targets for the Small Enterprise initiative —
              progress against each target is then tracked automatically from the survey data.
            </p>
            <Button
              className="mt-2 bg-brand-gradient text-white"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Set the first goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        PERIOD_ORDER.map((pt) => {
          const list = grouped.get(pt);
          if (!list || list.length === 0) return null;
          return (
            <section key={pt} className="space-y-3">
              <h3 className="font-display flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-emerald-950/70">
                <CalendarDays className="h-4 w-4 text-emerald-700" />
                {PERIOD_SECTION_LABEL[pt]}
                <span className="rounded-full bg-emerald-900/[0.07] px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  {list.length}
                </span>
              </h3>
              {list.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onEdit={(goal) => {
                    setEditing(goal);
                    setFormOpen(true);
                  }}
                  onDelete={setDeleting}
                />
              ))}
            </section>
          );
        })
      )}

      {/* New / edit dialog */}
      <GoalForm open={formOpen} onOpenChange={setFormOpen} onSaved={() => load(true)} editing={editing} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `${METRICS[deleting.metric as MetricKey]?.label ?? deleting.metric} for ${deleting.progress.label} will be removed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                removeGoal();
              }}
            >
              Delete Goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
