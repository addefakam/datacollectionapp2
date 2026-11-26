'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Store,
  Target,
  Trash2,
  TrendingUp,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/components/SettingsProvider';
import { cn } from '@/lib/utils';
import {
  SME_PERIOD_TYPES,
  SME_STATUS_META,
  SME_UNIT_STATUS_META,
  smeTargetScopeLabel,
  type SmePeriodType,
  type SmeStatus,
  type SmeTargetLevel,
  type SmeUnitStatus,
} from '@/lib/sme';

// ---------------------------------------------------------------------------
// Types (mirror /api/sme-targets responses)
// ---------------------------------------------------------------------------

interface TargetProgress {
  actual: number;
  achievementPct: number;
  pacePct: number;
  unitStatus: SmeUnitStatus;
  standing: Record<SmeStatus, number> & { total: number; members: number; femaleMembers: number };
  pending: number;
  operationalRate: number;
}

interface SmeTarget {
  id: string;
  level: SmeTargetLevel;
  subCity: string;
  area: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  targetValue: number;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  progress: TargetProgress;
}

interface SmeTargetManagerProps {
  refreshTrigger: number;
}

const fmt = (n: number) => n.toLocaleString('en');

/** Roll-up of a group of targets (city / sub-city / woreda) for the section band. */
interface GroupAggregate {
  target: number;
  actual: number;
  pct: number;
  onTrack: number;
  achieved: number;
  behind: number;
}

/** One row of the sub-city target-distribution table: a sub-city + period
 *  with its SUB_CITY target (if distributed) and its woreda targets. */
interface SubCityDistRow {
  key: string;
  subCity: string;
  periodLabel: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  target: SmeTarget | null;
  woredas: SmeTarget[];
  /** Registrations counted once — from the sub-city target when present, otherwise the woreda sum. */
  registered: number;
  pending: number;
  operational: number;
  members: number;
  /** Sum of the woreda target shares of this sub-city + period. */
  distributedTotal: number;
}

const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ccf1ea',
  boxShadow: '0 8px 24px -8px rgba(13,148,136,0.35)',
  fontSize: 12,
};

function aggregateOf(list: SmeTarget[]): GroupAggregate {
  const target = list.reduce((s, t) => s + t.targetValue, 0);
  const actual = list.reduce((s, t) => s + t.progress.actual, 0);
  // Same rounding as the API's achievementPct, so chips match the cards.
  const pct = target > 0 ? Math.round((actual / target) * 1000) / 100 : 0;
  const achieved = list.filter((t) => t.progress.unitStatus === 'achieved').length;
  const behind = list.filter((t) => t.progress.unitStatus === 'behind' || t.progress.unitStatus === 'missed').length;
  return { target, actual, pct, achieved, behind, onTrack: list.length - achieved - behind };
}

export default function SmeTargetManager({ refreshTrigger }: SmeTargetManagerProps) {
  const { toast } = useToast();
  const { subCities, areasFor } = useSettings();

  const [targets, setTargets] = React.useState<SmeTarget[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [distributing, setDistributing] = React.useState(false);

  // New / edit target form — only city-wide targets are created directly;
  // sub-city shares and woreda targets come from distribution.
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<SmeTarget | null>(null);
  const [periodType, setPeriodType] = React.useState<SmePeriodType>('yearly');
  const [refDate, setRefDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [targetValue, setTargetValue] = React.useState('');
  const [note, setNote] = React.useState('');

  // Distribution dialog
  const [distributeTarget, setDistributeTarget] = React.useState<SmeTarget | null>(null);
  const [distributeValues, setDistributeValues] = React.useState<Record<string, string>>({});

  // Sub-city distribution table — expanded row (sub-city + period) showing woreda details
  const [expandedRowKey, setExpandedRowKey] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetch('/api/sme-targets')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((json) => setTargets(json.data ?? []))
      .catch(() => toast({ title: 'Error', description: 'Failed to load SME targets', variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  // --- form helpers ---------------------------------------------------------

  const openCreate = () => {
    setEditTarget(null);
    setPeriodType('yearly');
    setRefDate(new Date().toISOString().slice(0, 10));
    setTargetValue('');
    setNote('');
    setFormOpen(true);
  };

  const openEdit = (t: SmeTarget) => {
    setEditTarget(t);
    setTargetValue(String(t.targetValue));
    setNote(t.note ?? '');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (editTarget) {
      setSaving(true);
      try {
        const res = await fetch(`/api/sme-targets/${editTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetValue: Number(targetValue), note }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Update failed');
        }
        toast({ title: 'Target Updated', description: `${editTarget.periodLabel} target is now ${fmt(Number(targetValue))} enterprises` });
        setFormOpen(false);
        load();
      } catch (error) {
        toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save', variant: 'destructive' });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!targetValue || Number(targetValue) <= 0) {
      toast({ title: 'Invalid Target', description: 'Enter a positive number of enterprises', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/sme-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'CITY',
          periodType,
          refDate,
          targetValue: Number(targetValue),
          note,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create target');
      toast({ title: 'Target Set', description: `${json.periodLabel}: ${fmt(json.targetValue)} enterprises at ${smeTargetScopeLabel(json.level, json.subCity, json.area)}` });
      setFormOpen(false);
      load();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to create target', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sme-targets/${deletingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Deleted', description: 'Target removed' });
      load();
    } catch {
      toast({ title: 'Delete Failed', description: 'Could not delete the target', variant: 'destructive' });
    } finally {
      setSaving(false);
      setDeletingId(null);
    }
  };

  // --- distribution ---------------------------------------------------------

  /** Child units of a distributable target: sub-cities for CITY, woredas for SUB_CITY. */
  const childUnits = React.useMemo<{ key: string; label: string }[]>(() => {
    if (!distributeTarget) return [];
    if (distributeTarget.level === 'CITY') {
      return subCities.map((sc) => ({ key: sc.name, label: sc.name }));
    }
    return areasFor(distributeTarget.subCity).map((a) => ({ key: a, label: a }));
  }, [distributeTarget, subCities, areasFor]);

  const openDistribute = (t: SmeTarget) => {
    setDistributeTarget(t);
    const n = t.level === 'CITY' ? subCities.length : areasFor(t.subCity).length;
    const equal = n > 0 ? Math.floor(t.targetValue / n) : 0;
    const values: Record<string, string> = {};
    if (t.level === 'CITY') subCities.forEach((sc) => { values[sc.name] = String(equal); });
    else areasFor(t.subCity).forEach((a) => { values[a] = String(equal); });
    setDistributeValues(values);
  };

  const distributeTotal = Object.values(distributeValues).reduce((s, v) => s + (Number(v) || 0), 0);
  const distributeRemaining = (distributeTarget?.targetValue ?? 0) - distributeTotal;
  const distributePct = distributeTarget && distributeTarget.targetValue > 0
    ? Math.min(100, (distributeTotal / distributeTarget.targetValue) * 100)
    : 0;

  /** Add the not-yet-distributed remainder equally across all child units (last unit takes the rounding leftover). */
  const distributeRemainingEqually = () => {
    if (!distributeTarget || childUnits.length === 0 || distributeRemaining <= 0) return;
    const each = Math.floor(distributeRemaining / childUnits.length);
    setDistributeValues((prev) => {
      const next = { ...prev };
      let leftover = distributeRemaining;
      childUnits.forEach(({ key }, i) => {
        const add = i === childUnits.length - 1 ? leftover : each;
        next[key] = String((Number(next[key]) || 0) + Math.max(0, add));
        leftover -= add;
      });
      return next;
    });
  };

  // --- overview stats & grouped list ---------------------------------------

  /** City-wide targets — presented as cards above the distribution table. */
  const cityTargets = React.useMemo(() => targets.filter((t) => t.level === 'CITY'), [targets]);

  /**
   * Sub-city target-distribution rows, one per (sub-city, period): the
   * SUB_CITY target of that period (when the city share was distributed) plus
   * the WOREDA targets assigned from it. Woreda targets whose sub-city has no
   * SUB_CITY target for the period still get a row so no assignment is hidden.
   * Sorted latest period first, then in Settings (sub-city) order.
   */
  const distRows = React.useMemo<SubCityDistRow[]>(() => {
    const map = new Map<string, {
      subCity: string;
      periodType: string;
      periodLabel: string;
      periodStart: string;
      periodEnd: string;
      target: SmeTarget | null;
      woredas: SmeTarget[];
    }>();
    for (const t of targets) {
      if (t.level === 'CITY') continue;
      const key = `${t.subCity}||${t.periodStart}||${t.periodEnd}`;
      let row = map.get(key);
      if (!row) {
        row = {
          subCity: t.subCity,
          periodType: t.periodType,
          periodLabel: t.periodLabel,
          periodStart: String(t.periodStart),
          periodEnd: String(t.periodEnd),
          target: null,
          woredas: [],
        };
        map.set(key, row);
      }
      if (t.level === 'SUB_CITY') {
        // keep the newest copy should duplicates ever appear
        if (!row.target || String(t.createdAt) > String(row.target.createdAt)) row.target = t;
      } else {
        row.woredas.push(t);
      }
    }
    const settingsOrder = new Map(subCities.map((sc, i) => [sc.name.toLowerCase(), i]));
    const list = [...map.values()];
    list.sort((a, b) =>
      b.periodStart.localeCompare(a.periodStart)
      || (settingsOrder.get(a.subCity.toLowerCase()) ?? 999) - (settingsOrder.get(b.subCity.toLowerCase()) ?? 999)
      || a.subCity.localeCompare(b.subCity)
    );
    return list.map((r) => {
      const woredas = [...r.woredas].sort((a, b) => (a.area || '').localeCompare(b.area || ''));
      const sum = (fn: (t: SmeTarget) => number) => woredas.reduce((s, t) => s + fn(t), 0);
      return {
        key: `${r.subCity}||${r.periodStart}||${r.periodEnd}`,
        subCity: r.subCity,
        periodLabel: r.periodLabel,
        periodType: r.periodType,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        target: r.target,
        woredas,
        // count each registration once: prefer the sub-city target's own figure
        registered: r.target ? r.target.progress.actual : sum((t) => t.progress.actual),
        pending: r.target ? r.target.progress.pending : sum((t) => t.progress.pending),
        operational: r.target ? r.target.progress.standing.OPERATIONAL : sum((t) => t.progress.standing.OPERATIONAL ?? 0),
        members: r.target ? r.target.progress.standing.members : sum((t) => t.progress.standing.members ?? 0),
        distributedTotal: sum((t) => t.targetValue),
      };
    });
  }, [targets, subCities]);

  /** Summary graph (left): target vs registered per sub-city for the latest period. */
  const summaryChartData = React.useMemo(() => {
    if (distRows.length === 0) return [];
    const latestStart = distRows[0].periodStart;
    const latestEnd = distRows[0].periodEnd;
    return distRows
      .filter((r) => r.periodStart === latestStart && r.periodEnd === latestEnd)
      .map((r) => ({
        label: r.subCity,
        Target: r.target ? r.target.targetValue : r.distributedTotal,
        Registered: r.registered,
      }));
  }, [distRows]);

  /** Summary graph (right): standing establishment pipeline per sub-city for the latest period. */
  const summaryPipelineData = React.useMemo(() => {
    if (distRows.length === 0) return [];
    const latestStart = distRows[0].periodStart;
    const latestEnd = distRows[0].periodEnd;
    return distRows
      .filter((r) => r.periodStart === latestStart && r.periodEnd === latestEnd)
      .map((r) => {
        const st = (k: SmeStatus) =>
          r.target
            ? (r.target.progress.standing[k] ?? 0)
            : r.woredas.reduce((s, t) => s + (t.progress.standing[k] ?? 0), 0);
        return {
          label: r.subCity,
          Registered: st('REGISTERED'),
          'Fully Legalized': st('FULLY_LEGALIZED'),
          'Awaiting Operation': st('AWAITING_OPERATION'),
          Operational: st('OPERATIONAL'),
        };
      });
  }, [distRows]);

  const stats = React.useMemo(() => {
    const targetSum = targets.reduce((s, t) => s + t.targetValue, 0);
    // Registrations must be counted ONCE. Target scopes nest (city ⊃
    // sub-city ⊃ woreda), so summing every card's own `actual` multi-counts
    // the same enterprises — e.g. city 2 + its sub-city 2 + its woreda 2
    // showed "Registered 6" for 2 real records. For each distinct period take
    // the widest level present: a city target already covers its sub-cities
    // and their woredas; woreda targets only add registrations when their
    // sub-city has no sub-city target in that period.
    const byPeriod = new Map<string, SmeTarget[]>();
    for (const t of targets) {
      const key = `${t.periodStart}..${t.periodEnd}`;
      const list = byPeriod.get(key) ?? [];
      list.push(t);
      byPeriod.set(key, list);
    }
    let actualSum = 0;
    byPeriod.forEach((list) => {
      const city = list.find((t) => t.level === 'CITY');
      if (city) {
        actualSum += city.progress.actual;
        return;
      }
      const subCityTargets = list.filter((t) => t.level === 'SUB_CITY');
      const coveredSubCities = new Set(subCityTargets.map((t) => t.subCity));
      actualSum += subCityTargets.reduce((s, t) => s + t.progress.actual, 0);
      actualSum += list
        .filter((t) => t.level === 'WOREDA' && !coveredSubCities.has(t.subCity))
        .reduce((s, t) => s + t.progress.actual, 0);
    });
    return {
      city: targets.filter((t) => t.level === 'CITY').length,
      subCity: targets.filter((t) => t.level === 'SUB_CITY').length,
      woreda: targets.filter((t) => t.level === 'WOREDA').length,
      achieved: targets.filter((t) => t.progress.unitStatus === 'achieved').length,
      targetSum,
      actualSum,
      // Same rounding as the API's achievementPct (one decimal), so the strip
      // matches the cards — /100 here displayed 0.03% where the API says 0.1%.
      overallPct: targetSum > 0 ? Math.round((actualSum / targetSum) * 1000) / 10 : 0,
    };
  }, [targets]);

  const handleDistribute = async () => {
    if (!distributeTarget) return;
    setDistributing(true);
    try {
      const items = childUnits.map(({ key }) => ({
        subCity: distributeTarget.level === 'CITY' ? key : undefined,
        area: distributeTarget.level === 'SUB_CITY' ? key : undefined,
        targetValue: Number(distributeValues[key] ?? 0) || 0,
      }));
      const res = await fetch('/api/sme-targets/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: distributeTarget.id, items }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Distribution failed');
      toast({ title: 'Target Distributed', description: `${json.distributed} ${distributeTarget.level === 'CITY' ? 'sub-cities' : 'woredas'} received their share of the ${fmt(distributeTarget.targetValue)} target` });
      setDistributeTarget(null);
      load();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to distribute', variant: 'destructive' });
    } finally {
      setDistributing(false);
    }
  };

  // --- render ---------------------------------------------------------------

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card className="rounded-2xl border-teal-100">
        <CardHeaderComponent
          total={targets.length}
          onNew={openCreate}
          onRefresh={load}
          loading={loading}
        />
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
            </div>
          ) : targets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Target className="h-10 w-10 text-teal-300" />
              <p className="text-sm font-semibold text-teal-950">No establishment targets yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Set the city-wide target, then distribute shares to sub-cities — and sub-cities to their woredas.
                Performance is tracked automatically from SME registrations.
              </p>
              <Button size="sm" onClick={openCreate} className="mt-1 bg-teal-700 text-white hover:bg-teal-800">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Set the first target
              </Button>
            </div>
          ) : (
            <>
              {/* Overview strip — the same figures as the target cards:
                  Target / Registered / Achievement, plus the level breakdown */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryStat
                  icon={<Store className="h-3 w-3 text-teal-600" />}
                  label="Targets"
                  value={targets.length}
                  hint={`${stats.city} city-wide · ${stats.subCity} sub-city · ${stats.woreda} woreda`}
                />
                <SummaryStat
                  icon={<Target className="h-3 w-3 text-teal-600" />}
                  label="Target enterprises"
                  value={fmt(stats.targetSum)}
                  hint="sum of every set target"
                />
                <SummaryStat
                  icon={<Users className="h-3 w-3 text-teal-600" />}
                  label="Registered"
                  value={fmt(stats.actualSum)}
                  hint="live from registrations"
                />
                <SummaryStat
                  icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                  label="Overall progress"
                  value={`${stats.overallPct}%`}
                  hint={`${stats.achieved} of ${targets.length} targets fully achieved`}
                  progressPct={stats.overallPct}
                />
              </div>

              {cityTargets.length > 0 && (
                <div className="space-y-2.5">
                  <GroupHeading icon={<Target className="h-3.5 w-3.5 text-teal-700" />} label="City-wide targets" count={cityTargets.length} hint="the overall goal for the whole city" aggregate={cityTargets.length > 1 ? aggregateOf(cityTargets) : undefined} />
                  {cityTargets.map((t) => (
                    <TargetCard key={t.id} t={t} onDistribute={openDistribute} onEdit={openEdit} onDelete={setDeletingId} />
                  ))}
                </div>
              )}

              {/* Sub-city target distribution — table with click-through woreda details */}
              {distRows.length > 0 && (
                <div className="space-y-2.5">
                  <GroupHeading icon={<MapPin className="h-3.5 w-3.5 text-blue-600" />} label="Sub-city target distribution" count={distRows.length} hint="shares of the city target — click a sub-city for its woredas" />
                  <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[880px] text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-500">
                            <th className="py-2.5 pl-4 pr-2 font-semibold">Sub-City</th>
                            <th className="py-2.5 pr-2 font-semibold">Period</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Target</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Share of City</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Registered</th>
                            <th className="py-2.5 pr-2 font-semibold">Achievement</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Pending</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Operational</th>
                            <th className="py-2.5 pr-2 text-right font-semibold">Members</th>
                            <th className="py-2.5 pr-2 font-semibold">Status</th>
                            <th className="py-2.5 pr-4 text-right font-semibold"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {distRows.map((row) => {
                            const cityTarget = cityTargets.find(
                              (c) => String(c.periodStart) === row.periodStart && String(c.periodEnd) === row.periodEnd
                            );
                            const pct = row.target && row.target.targetValue > 0
                              ? row.target.progress.achievementPct
                              : row.distributedTotal > 0
                                ? Math.round((row.registered / row.distributedTotal) * 1000) / 10
                                : 0;
                            const unitStatus = row.target ? row.target.progress.unitStatus : (row.distributedTotal > 0 ? 'on_track' : 'no_target');
                            const statusMeta = SME_UNIT_STATUS_META[unitStatus];
                            const expanded = expandedRowKey === row.key;
                            const sharePct = cityTarget && cityTarget.targetValue > 0 && row.target
                              ? Math.round((row.target.targetValue / cityTarget.targetValue) * 1000) / 10
                              : null;
                            const distributedPct = row.target && row.target.targetValue > 0
                              ? Math.min(100, (row.distributedTotal / row.target.targetValue) * 100)
                              : 0;
                            return (
                              <React.Fragment key={row.key}>
                                <tr
                                  className={cn(
                                    'cursor-pointer border-b border-teal-50 transition-colors hover:bg-teal-50/60',
                                    expanded && 'bg-teal-50/80'
                                  )}
                                  onClick={() => setExpandedRowKey(expanded ? null : row.key)}
                                  title="Click to see this sub-city's woreda details"
                                >
                                  <td className="py-2.5 pl-4 pr-2 font-semibold text-teal-950">
                                    <span className="inline-flex items-center gap-1.5">
                                      {expanded
                                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-teal-400" />}
                                      {row.subCity}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-2 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5">
                                      <CalendarDays className="h-3 w-3 text-slate-400" />
                                      {row.periodLabel} · {row.periodType}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pr-2 text-right font-semibold text-teal-900">
                                    {row.target ? fmt(row.target.targetValue) : <span className="text-[10px] italic text-amber-600">not set</span>}
                                  </td>
                                  <td className="py-2.5 pr-2 text-right text-slate-600">
                                    {sharePct != null ? `${sharePct}%` : '—'}
                                  </td>
                                  <td className="py-2.5 pr-2 text-right font-semibold text-slate-900">{fmt(row.registered)}</td>
                                  <td className="py-2.5 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                                        <div
                                          className={cn(
                                            'h-full rounded-full',
                                            pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-teal-500' : 'bg-slate-200'
                                          )}
                                          style={{ width: `${Math.min(pct, 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-[11px] font-medium text-teal-900">{pct > 0 || row.target ? `${pct}%` : '—'}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 pr-2 text-right">{fmt(row.pending)}</td>
                                  <td className="py-2.5 pr-2 text-right font-semibold text-emerald-700">{fmt(row.operational)}</td>
                                  <td className="py-2.5 pr-2 text-right text-slate-600">{fmt(row.members)}</td>
                                  <td className="py-2.5 pr-2">
                                    <Badge variant="outline" className={cn('text-[10px]', statusMeta.badgeClass)}>{statusMeta.label}</Badge>
                                  </td>
                                  <td className="py-2.5 pr-4">
                                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                      {row.target && (
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7"
                                          title={`Distribute ${row.subCity}'s share to its woredas`}
                                          onClick={() => openDistribute(row.target as SmeTarget)}
                                        >
                                          <Share2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {row.target && (
                                        <Button variant="outline" size="icon" className="h-7 w-7" title="Edit this target" onClick={() => openEdit(row.target as SmeTarget)}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      )}
                                      {row.target && (
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7 border-red-200 text-red-500 hover:bg-red-50"
                                          title="Delete this target"
                                          onClick={() => setDeletingId((row.target as SmeTarget).id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {expanded && (
                                  <tr className="border-b border-teal-50 bg-blue-50/30">
                                    <td colSpan={11} className="px-4 py-3">
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-950">
                                            <ChevronRight className="h-3.5 w-3.5 text-blue-600" />
                                            Woredas of {row.subCity} — {row.periodLabel}
                                          </p>
                                          {row.target && (
                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                              <span>
                                                Distributed <span className="font-semibold text-teal-900">{fmt(row.distributedTotal)}</span> of {fmt(row.target.targetValue)}
                                              </span>
                                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white">
                                                <div
                                                  className={cn('h-full rounded-full', distributedPct >= 100 ? 'bg-emerald-500' : 'bg-teal-600')}
                                                  style={{ width: `${distributedPct}%` }}
                                                />
                                              </div>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 px-2 text-[10px]"
                                                onClick={() => openDistribute(row.target as SmeTarget)}
                                              >
                                                <Share2 className="mr-1 h-2.5 w-2.5" /> Assign to woredas
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                        {row.woredas.length > 0 ? (
                                          <div className="overflow-x-auto rounded-lg border border-teal-100 bg-white">
                                            <table className="w-full min-w-[720px] text-left text-xs">
                                              <thead>
                                                <tr className="border-b border-teal-100 bg-teal-50/40 text-[10px] uppercase tracking-wide text-teal-900/60">
                                                  <th className="py-2 pl-3 pr-2 font-semibold">Woreda</th>
                                                  <th className="py-2 pr-2 text-right font-semibold">Target</th>
                                                  <th className="py-2 pr-2 text-right font-semibold">Registered</th>
                                                  <th className="py-2 pr-2 font-semibold">Achievement</th>
                                                  <th className="py-2 pr-2 text-right font-semibold">Pending</th>
                                                  <th className="py-2 pr-2 text-right font-semibold">Operational</th>
                                                  <th className="py-2 pr-2 text-right font-semibold">Members</th>
                                                  <th className="py-2 pr-2 font-semibold">Status</th>
                                                  <th className="py-2 pr-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {row.woredas.map((w) => {
                                                  const wMeta = SME_UNIT_STATUS_META[w.progress.unitStatus];
                                                  return (
                                                    <tr key={w.id} className="border-b border-teal-50 transition-colors last:border-b-0 hover:bg-teal-50/50">
                                                      <td className="py-2 pl-3 pr-2 font-semibold text-teal-950">{w.area || '—'}</td>
                                                      <td className="py-2 pr-2 text-right font-semibold text-teal-900">{fmt(w.targetValue)}</td>
                                                      <td className="py-2 pr-2 text-right font-semibold">{fmt(w.progress.actual)}</td>
                                                      <td className="py-2 pr-2">
                                                        <div className="flex items-center gap-1.5">
                                                          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                                                            <div
                                                              className={cn(
                                                                'h-full rounded-full',
                                                                w.progress.achievementPct >= 100 ? 'bg-emerald-500' : w.progress.achievementPct > 0 ? 'bg-teal-500' : 'bg-slate-200'
                                                              )}
                                                              style={{ width: `${Math.min(w.progress.achievementPct, 100)}%` }}
                                                            />
                                                          </div>
                                                          <span className="text-[11px] font-medium text-teal-900">{w.progress.achievementPct}%</span>
                                                        </div>
                                                      </td>
                                                      <td className="py-2 pr-2 text-right">{fmt(w.progress.pending)}</td>
                                                      <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{fmt(w.progress.standing.OPERATIONAL ?? 0)}</td>
                                                      <td className="py-2 pr-2 text-right text-slate-600">{fmt(w.progress.standing.members ?? 0)}</td>
                                                      <td className="py-2 pr-2">
                                                        <Badge variant="outline" className={cn('text-[10px]', wMeta.badgeClass)}>{wMeta.label}</Badge>
                                                      </td>
                                                      <td className="py-2 pr-3">
                                                        <div className="flex justify-end gap-1">
                                                          <Button variant="outline" size="icon" className="h-6 w-6" title="Edit this woreda target" onClick={() => openEdit(w)}>
                                                            <Pencil className="h-2.5 w-2.5" />
                                                          </Button>
                                                          <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-6 w-6 border-red-200 text-red-500 hover:bg-red-50"
                                                            title="Delete this woreda target"
                                                            onClick={() => setDeletingId(w.id)}
                                                          >
                                                            <Trash2 className="h-2.5 w-2.5" />
                                                          </Button>
                                                        </div>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <p className="rounded-lg border border-dashed border-teal-200 bg-white/70 px-3 py-3 text-xs text-muted-foreground">
                                            No woreda targets assigned for {row.subCity} in {row.periodLabel} yet
                                            {row.target ? ' — use "Assign to woredas" to split this sub-city\'s share.' : ' — distribute the city target to this sub-city first.'}
                                          </p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary graphs — distribution & registration progress across sub-cities */}
              {distRows.length > 0 && (
                <Card className="rounded-2xl border-teal-100">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-base">
                      <TrendingUp className="h-4 w-4 text-teal-700" />
                      Distribution Summary
                    </CardTitle>
                    <CardDescription>
                      Target vs registrations and the establishment pipeline per sub-city — {distRows[0]?.periodLabel ?? ''}. Click a sub-city row above for woreda details.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/60">Target vs Registered</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={summaryChartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                            <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                            <Tooltip contentStyle={chartTooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="Target" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={20} isAnimationActive={false} />
                            <Bar dataKey="Registered" fill="#0d9488" radius={[6, 6, 0, 0]} barSize={20} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/60">Establishment pipeline (standing today)</p>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={summaryPipelineData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                            <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                            <Tooltip contentStyle={chartTooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {(['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'] as SmeStatus[]).map((s) => (
                              <Bar
                              isAnimationActive={false}
                                key={s}
                                dataKey={SME_STATUS_META[s].label}
                                stackId="pipe"
                                fill={SME_STATUS_META[s].color}
                                barSize={22}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) setFormOpen(false); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-teal-700" />
              {editTarget ? 'Edit Target' : 'Set SME Establishment Target'}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? 'Adjust the target value or note — scope and period are fixed.'
                : 'How many small enterprises should be established city-wide this period? Sub-cities will share this target.'}
            </DialogDescription>
          </DialogHeader>
          {editTarget ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-xs text-teal-900">
                <p className="font-semibold">{smeTargetScopeLabel(editTarget.level, editTarget.subCity, editTarget.area)}</p>
                <p className="text-[11px]">{editTarget.periodLabel} · {editTarget.periodType}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sme-target-value" className="text-xs">Target (number of enterprises) *</Label>
                <Input id="sme-target-value" type="number" min="1" step="1" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sme-target-note" className="text-xs">Note</Label>
                <Input id="sme-target-note" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-xs text-teal-900">
                <p className="font-semibold">City-wide target — the source of all shares</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  Set the overall goal for the whole city here. Sub-cities then receive
                  their shares via the <span className="font-medium">Distribute</span> button,
                  and each sub-city assigns targets to its woredas from its own share.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Period Type *</Label>
                  <Select value={periodType} onValueChange={(v) => setPeriodType(v as SmePeriodType)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sme-ref-date" className="text-xs">Date in Period *</Label>
                  <Input id="sme-ref-date" type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sme-target-value" className="text-xs">Target (number of enterprises) *</Label>
                <Input id="sme-target-value" type="number" min="1" step="1" placeholder="e.g., 500" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sme-target-note" className="text-xs">Note</Label>
                <Input id="sme-target-note" placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} className="text-sm" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-teal-700 text-white hover:bg-teal-800">
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Target className="mr-1.5 h-4 w-4" />}
              {editTarget ? 'Save' : 'Set Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribute dialog */}
      <Dialog open={!!distributeTarget} onOpenChange={(open) => { if (!open) setDistributeTarget(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-teal-700" />
              {distributeTarget?.level === 'CITY' ? 'Distribute to Sub-Cities' : 'Assign Targets to Woredas'}
            </DialogTitle>
            <DialogDescription>
              {distributeTarget
                ? `Split the ${fmt(distributeTarget.targetValue)}-enterprise ${distributeTarget.periodLabel} target across ${distributeTarget.level === 'CITY' ? 'all sub-cities' : `the woredas of ${distributeTarget.subCity}`}.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {childUnits.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-teal-100 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-teal-950">
                  {distributeTarget?.level === 'CITY' ? <MapPin className="h-3.5 w-3.5 text-teal-600" /> : <ChevronRight className="h-3.5 w-3.5 text-teal-600" />}
                  {label}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="h-8 w-24 text-sm"
                  value={distributeValues[key] ?? ''}
                  onChange={(e) => setDistributeValues((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
            {childUnits.length === 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No {distributeTarget?.level === 'CITY' ? 'sub-cities' : 'woredas'} configured yet — add them in Settings first.
              </p>
            )}
            <div className="space-y-1.5 rounded-lg border border-teal-100 bg-slate-50/60 px-3 py-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className={cn('flex items-center gap-1.5', distributeRemaining === 0 ? 'text-teal-800' : 'text-amber-800')}>
                  {distributeRemaining !== 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                  Distributed total
                </span>
                <span className="text-teal-950">{fmt(distributeTotal)} / {fmt(distributeTarget?.targetValue ?? 0)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div className={cn('h-full rounded-full', distributeRemaining === 0 ? 'bg-teal-600' : 'bg-amber-500')} style={{ width: `${distributePct}%` }} />
              </div>
              <p className={cn('text-[10px]', distributeRemaining === 0 ? 'text-teal-700' : 'text-amber-700')}>
                {distributeRemaining === 0
                  ? 'Fully distributed — every enterprise is accounted for.'
                  : distributeRemaining > 0
                    ? `${fmt(distributeRemaining)} enterprises not yet assigned.`
                    : `${fmt(-distributeRemaining)} more than the parent target.`}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={distributeRemaining <= 0 || childUnits.length === 0}
              onClick={distributeRemainingEqually}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add remaining {fmt(Math.max(0, distributeRemaining))} equally
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributeTarget(null)}>Cancel</Button>
            <Button onClick={handleDistribute} disabled={distributing || childUnits.length === 0 || distributeRemaining < 0} className="bg-teal-700 text-white hover:bg-teal-800">
              {distributing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Share2 className="mr-1.5 h-4 w-4" />}
              Save Distribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this target?</AlertDialogTitle>
            <AlertDialogDescription>
              The establishment target will be removed. Registered enterprises are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving} className="bg-red-600 text-white hover:bg-red-700">
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** One target: scope header, actions, and live progress against registrations. */
function TargetCard({
  t,
  onDistribute,
  onEdit,
  onDelete,
}: {
  t: SmeTarget;
  onDistribute: (t: SmeTarget) => void;
  onEdit: (t: SmeTarget) => void;
  onDelete: (id: string) => void;
}) {
  const statusMeta = SME_UNIT_STATUS_META[t.progress.unitStatus];
  const canDistribute = t.level === 'CITY' || t.level === 'SUB_CITY';
  const standing = t.progress.standing;

  // Visual identity per administrative level (icon chip) …
  const levelChip =
    t.level === 'CITY'
      ? { icon: <Target className="h-4 w-4 text-teal-700" />, chip: 'bg-teal-50' }
      : t.level === 'SUB_CITY'
        ? { icon: <MapPin className="h-4 w-4 text-blue-600" />, chip: 'bg-blue-50' }
        : { icon: <ChevronRight className="h-4 w-4 text-violet-600" />, chip: 'bg-violet-50' };
  // … and per live status (left accent + progress fill).
  const accent =
    t.progress.unitStatus === 'achieved' ? 'bg-emerald-500'
      : t.progress.unitStatus === 'on_track' ? 'bg-teal-500'
        : t.progress.unitStatus === 'behind' ? 'bg-red-400'
          : t.progress.unitStatus === 'missed' ? 'bg-orange-400'
            : t.progress.unitStatus === 'upcoming' ? 'bg-indigo-400'
              : 'bg-slate-300';
  const barFill =
    t.progress.unitStatus === 'achieved' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
      : t.progress.unitStatus === 'behind' || t.progress.unitStatus === 'missed' ? 'bg-gradient-to-r from-red-500 to-orange-400'
        : t.progress.unitStatus === 'upcoming' ? 'bg-gradient-to-r from-indigo-500 to-indigo-400'
          : 'bg-gradient-to-r from-teal-600 to-emerald-400';

  const compositionTotal = standing.total ?? 0;
  const STATUSES: SmeStatus[] = ['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', accent)} />
      <div className="space-y-3 p-4 pl-5">
        {/* Scope header + actions */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', levelChip.chip)}>
              {levelChip.icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {smeTargetScopeLabel(t.level, t.subCity, t.area)}
                </p>
                <Badge variant="outline" className={cn('text-[10px]', statusMeta.badgeClass)}>{statusMeta.label}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5">
                  <CalendarDays className="h-3 w-3 text-slate-400" />
                  {t.periodLabel} · {t.periodType}
                </span>
                {t.createdByName && <span>set by {t.createdByName}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-row gap-1">
            {canDistribute && (
              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => onDistribute(t)}>
                <Share2 className="mr-1 h-3 w-3" />
                {t.level === 'CITY' ? 'Distribute' : 'Assign to woredas'}
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(t)} title="Edit target">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 border-red-200 text-red-500 hover:bg-red-50" onClick={() => onDelete(t.id)} title="Delete target">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Target vs registered vs achievement */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60">
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Target</p>
            <p className="mt-1 text-base font-bold leading-none text-teal-950">
              {fmt(t.targetValue)}
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">ent.</span>
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Registered</p>
            <p className="mt-1 text-base font-bold leading-none text-slate-900">
              {fmt(t.progress.actual)}
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">ent.</span>
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Achievement</p>
            <p className={cn('mt-1 text-base font-bold leading-none', t.progress.achievementPct >= 100 ? 'text-emerald-600' : 'text-teal-800')}>
              {t.progress.achievementPct}%
            </p>
          </div>
        </div>

        {/* Progress against the period */}
        <div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', barFill)}
              style={{ width: `${Math.min(t.progress.achievementPct, 100)}%` }}
            />
            {/* pace marker */}
            <div className="absolute inset-y-0 w-0.5 bg-amber-500/90" style={{ left: `${Math.min(t.progress.pacePct, 100)}%` }} title="Expected pace for today" />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            <span aria-hidden className="mr-1 inline-block h-2 w-0.5 translate-y-0.5 bg-amber-500" />
            {t.progress.pacePct}% of the period elapsed — the amber marker shows the expected pace for today.
          </p>
        </div>

        {/* Composition of registered enterprises */}
        {compositionTotal > 0 && (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" title="Composition of registered enterprises">
            {STATUSES.map((s) =>
              (standing[s] ?? 0) > 0 ? (
                <div key={s} style={{ width: `${((standing[s] ?? 0) / compositionTotal) * 100}%`, backgroundColor: SME_STATUS_META[s].color }} />
              ) : null
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SME_STATUS_META[s].color }} />
              {SME_STATUS_META[s].label} <span className="font-semibold text-slate-800">{fmt(standing[s] ?? 0)}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            <Users className="h-3 w-3" />{fmt(standing.members ?? 0)} members
          </span>
        </div>

        {t.note && (
          <p className="border-l-2 border-teal-200 pl-2 text-[11px] italic text-muted-foreground">{t.note}</p>
        )}
      </div>
    </div>
  );
}

/** Section heading for one administrative level of the target hierarchy. */
function GroupHeading({ icon, label, count, hint, aggregate }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  hint?: string;
  aggregate?: GroupAggregate;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/80 via-white to-white px-3 py-2">
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/80">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white shadow-sm">{icon}</span>
        {label}
      </span>
      <Badge variant="secondary" className="bg-white text-[10px] text-teal-700 shadow-sm">{count}</Badge>
      {hint && <span className="hidden text-[10px] text-muted-foreground sm:inline">{hint}</span>}
      {aggregate && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <AggChip label="Target" value={fmt(aggregate.target)} />
          <AggChip label="Registered" value={fmt(aggregate.actual)} />
          <AggChip label="Overall" value={`${aggregate.pct}%`} tone={aggregate.pct >= 100 ? 'emerald' : 'teal'} />
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">
            {aggregate.onTrack > 0 && (
              <span><span className="font-semibold text-teal-700">{aggregate.onTrack}</span> on track</span>
            )}
            {aggregate.behind > 0 && (
              <span>· <span className="font-semibold text-red-600">{aggregate.behind}</span> behind</span>
            )}
            {aggregate.achieved > 0 && (
              <span>· <span className="font-semibold text-emerald-600">{aggregate.achieved}</span> achieved</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/** Small label:value chip used in the group heading band. */
function AggChip({ label, value, tone }: { label: string; value: string; tone?: 'teal' | 'emerald' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] text-slate-500 shadow-sm">
      {label}
      <span className={cn('font-semibold', tone === 'emerald' ? 'text-emerald-600' : 'text-teal-800')}>{value}</span>
    </span>
  );
}

/** Compact overview stat for the strip above the target list. */
function SummaryStat({ icon, label, value, hint, progressPct }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint: string;
  /** Optional 0–100 figure rendered as a slim bar so the strip matches the cards. */
  progressPct?: number;
}) {
  return (
    <div className="rounded-xl border border-teal-100 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-teal-900/60">{icon}{label}</p>
      <p className="mt-1 text-xl font-bold leading-none text-teal-950">{value}</p>
      {typeof progressPct === 'number' && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn('h-full rounded-full', progressPct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-teal-600 to-emerald-400')}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Local header — keeps the component self-contained. */
function CardHeaderComponent({
  total,
  onNew,
  onRefresh,
  loading,
}: {
  total: number;
  onNew: () => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
          <Store className="h-5 w-5 text-teal-700" />
          SME Establishment Targets
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">{total}</Badge>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          City target → distributed to sub-cities → assigned to woredas. Progress is computed live from registrations.
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-8 px-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" onClick={onNew} className="h-8 bg-teal-700 px-3 text-xs text-white hover:bg-teal-800">
          <Plus className="mr-1 h-3.5 w-3.5" /> Set Target
        </Button>
      </div>
    </div>
  );
}
