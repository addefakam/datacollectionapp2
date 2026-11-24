'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CalendarDays,
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
    <div className="mx-auto max-w-4xl space-y-4">
      <Card className="rounded-2xl border-teal-100">
        <CardHeaderComponent
          total={targets.length}
          onNew={openCreate}
          onRefresh={load}
          loading={loading}
        />
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
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
            targets.map((t) => {
              const statusMeta = SME_UNIT_STATUS_META[t.progress.unitStatus];
              const canDistribute = t.level === 'CITY' || t.level === 'SUB_CITY';
              return (
                <div key={t.id} className="rounded-xl border border-teal-100 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            t.level === 'CITY' && 'bg-teal-100 text-teal-800',
                            t.level === 'SUB_CITY' && 'bg-blue-50 text-blue-700',
                            t.level === 'WOREDA' && 'bg-violet-50 text-violet-700'
                          )}
                        >
                          {t.level === 'CITY' ? 'City-wide' : t.level === 'SUB_CITY' ? 'Sub-city' : 'Woreda'}
                        </Badge>
                        <p className="text-sm font-semibold text-teal-950">
                          {smeTargetScopeLabel(t.level, t.subCity, t.area)}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{t.periodLabel} · {t.periodType}</span>
                        <span className="font-semibold text-teal-900">Target {fmt(t.targetValue)} enterprises</span>
                        {t.createdByName && <span>set by {t.createdByName}</span>}
                      </div>
                      {t.note && <p className="mt-1 text-[11px] italic text-muted-foreground">{t.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-row gap-1">
                      {canDistribute && (
                        <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => openDistribute(t)}>
                          <Share2 className="mr-1 h-3 w-3" />
                          {t.level === 'CITY' ? 'Distribute' : 'Assign to woredas'}
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 border-red-200 text-red-500 hover:bg-red-50" onClick={() => setDeletingId(t.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Live progress */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        Registered <span className="font-bold text-teal-900">{fmt(t.progress.actual)}</span> of {fmt(t.targetValue)}
                        {' · '}{t.progress.achievementPct}% of target vs {t.progress.pacePct}% of period elapsed
                      </span>
                      <Badge variant="outline" className={cn('text-[10px]', statusMeta.badgeClass)}>{statusMeta.label}</Badge>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-teal-50">
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 rounded-full',
                          t.progress.unitStatus === 'achieved' ? 'bg-emerald-500'
                            : t.progress.unitStatus === 'behind' || t.progress.unitStatus === 'missed' ? 'bg-red-400'
                              : 'bg-teal-500'
                        )}
                        style={{ width: `${Math.min(t.progress.achievementPct, 100)}%` }}
                      />
                      {/* pace marker */}
                      <div className="absolute inset-y-0 w-0.5 bg-amber-500/70" style={{ left: `${Math.min(t.progress.pacePct, 100)}%` }} title="Expected pace" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                      {(['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'] as SmeStatus[]).map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-slate-600">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SME_STATUS_META[s].color }} />
                          {SME_STATUS_META[s].label} {fmt(t.progress.standing[s] ?? 0)}
                        </span>
                      ))}
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                        <Users className="h-3 w-3" />{fmt(t.progress.standing.members ?? 0)} members
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
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
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium',
              distributeTotal === (distributeTarget?.targetValue ?? 0)
                ? 'bg-teal-50 text-teal-800'
                : 'bg-amber-50 text-amber-800'
            )}>
              <span className="flex items-center gap-1.5">
                {distributeTotal !== (distributeTarget?.targetValue ?? 0) && <AlertTriangle className="h-3.5 w-3.5" />}
                Distributed total
              </span>
              <span>{fmt(distributeTotal)} / {fmt(distributeTarget?.targetValue ?? 0)}</span>
            </div>
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
          <Store className="h-5 w-5 text-amber-600" />
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
