'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
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
  progress: TargetProgress;
}

interface SmeTargetManagerProps {
  refreshTrigger: number;
}

const LEVEL_OPTIONS: { value: SmeTargetLevel; label: string; hint: string }[] = [
  { value: 'CITY', label: 'City-wide', hint: 'Overall establishment target for the whole city' },
  { value: 'SUB_CITY', label: 'Sub-city', hint: "One sub-city's establishment target" },
  { value: 'WOREDA', label: 'Woreda', hint: "One woreda's establishment target (assigned by the sub-city)" },
];

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

  // New / edit target form
  const [formOpen, setFormOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<SmeTarget | null>(null);
  const [level, setLevel] = React.useState<SmeTargetLevel>('CITY');
  const [formSubCity, setFormSubCity] = React.useState('');
  const [formArea, setFormArea] = React.useState('');
  const [periodType, setPeriodType] = React.useState<SmePeriodType>('yearly');
  const [refDate, setRefDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [targetValue, setTargetValue] = React.useState('');
  const [note, setNote] = React.useState('');

  // Distribution dialog
  const [distributeTarget, setDistributeTarget] = React.useState<SmeTarget | null>(null);
  const [distributeValues, setDistributeValues] = React.useState<Record<string, string>>({});

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
    setLevel('CITY');
    setFormSubCity('');
    setFormArea('');
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

    if (level !== 'CITY' && !formSubCity) {
      toast({ title: 'Field Missing', description: 'Select the sub-city for this target', variant: 'destructive' });
      return;
    }
    if (level === 'WOREDA' && !formArea) {
      toast({ title: 'Field Missing', description: 'Select the woreda for this target', variant: 'destructive' });
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
          level,
          subCity: level === 'CITY' ? undefined : formSubCity,
          area: level === 'WOREDA' ? formArea : undefined,
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

  /** Targets grouped by administrative level so the city → sub-city → woreda hierarchy reads top-down. */
  const grouped = React.useMemo(() => {
    const order: Record<SmeTargetLevel, number> = { CITY: 0, SUB_CITY: 1, WOREDA: 2 };
    const sorted = [...targets].sort((a, b) =>
      order[a.level] - order[b.level]
      || (a.subCity || '').localeCompare(b.subCity || '')
      || (a.area || '').localeCompare(b.area || '')
      || a.periodStart.localeCompare(b.periodStart)
    );
    return {
      city: sorted.filter((t) => t.level === 'CITY'),
      subCity: sorted.filter((t) => t.level === 'SUB_CITY'),
      woreda: sorted.filter((t) => t.level === 'WOREDA'),
    };
  }, [targets]);

  const stats = React.useMemo(() => {
    const targetSum = targets.reduce((s, t) => s + t.targetValue, 0);
    const actualSum = targets.reduce((s, t) => s + t.progress.actual, 0);
    return {
      city: targets.filter((t) => t.level === 'CITY').length,
      subCity: targets.filter((t) => t.level === 'SUB_CITY').length,
      woreda: targets.filter((t) => t.level === 'WOREDA').length,
      achieved: targets.filter((t) => t.progress.unitStatus === 'achieved').length,
      targetSum,
      actualSum,
      // Same rounding as the API's achievementPct, so the strip matches the cards.
      overallPct: targetSum > 0 ? Math.round((actualSum / targetSum) * 1000) / 100 : 0,
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

              {grouped.city.length > 0 && (
                <div className="space-y-2.5">
                  <GroupHeading icon={<Target className="h-3.5 w-3.5 text-teal-700" />} label="City-wide targets" count={grouped.city.length} hint="the overall goal for the whole city" aggregate={grouped.city.length > 1 ? aggregateOf(grouped.city) : undefined} />
                  {grouped.city.map((t) => (
                    <TargetCard key={t.id} t={t} onDistribute={openDistribute} onEdit={openEdit} onDelete={setDeletingId} />
                  ))}
                </div>
              )}
              {grouped.subCity.length > 0 && (
                <div className="space-y-2.5">
                  <GroupHeading icon={<MapPin className="h-3.5 w-3.5 text-blue-600" />} label="Sub-city targets" count={grouped.subCity.length} hint="shares distributed from the city target" aggregate={grouped.subCity.length > 1 ? aggregateOf(grouped.subCity) : undefined} />
                  {grouped.subCity.map((t) => (
                    <TargetCard key={t.id} t={t} onDistribute={openDistribute} onEdit={openEdit} onDelete={setDeletingId} />
                  ))}
                </div>
              )}
              {grouped.woreda.length > 0 && (
                <div className="space-y-2.5">
                  <GroupHeading icon={<ChevronRight className="h-3.5 w-3.5 text-violet-600" />} label="Woreda targets" count={grouped.woreda.length} hint="assigned by sub-cities" aggregate={grouped.woreda.length > 1 ? aggregateOf(grouped.woreda) : undefined} />
                  {grouped.woreda.map((t) => (
                    <TargetCard key={t.id} t={t} onDistribute={openDistribute} onEdit={openEdit} onDelete={setDeletingId} />
                  ))}
                </div>
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
                : 'How many small enterprises should be established in this scope and period?'}
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
              <div className="space-y-1.5">
                <Label className="text-xs">Administrative Level *</Label>
                <Select value={level} onValueChange={(v) => { setLevel(v as SmeTargetLevel); setFormSubCity(''); setFormArea(''); }}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="font-medium">{o.label}</span>
                        <span className="block text-[10px] text-muted-foreground">{o.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {level !== 'CITY' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sub-City *</Label>
                  <Select value={formSubCity} onValueChange={(v) => { setFormSubCity(v); setFormArea(''); }}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select sub-city" /></SelectTrigger>
                    <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              )}
              {level === 'WOREDA' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Woreda *</Label>
                  <Select value={formArea} onValueChange={setFormArea} disabled={!formSubCity}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder={formSubCity ? 'Select woreda' : 'Select sub-city first'} /></SelectTrigger>
                    <SelectContent>{areasFor(formSubCity).map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              )}
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
            <Button onClick={handleDistribute} disabled={distributing || childUnits.length === 0} className="bg-teal-700 text-white hover:bg-teal-800">
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
