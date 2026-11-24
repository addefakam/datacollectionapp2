'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  RefreshCw,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/components/SettingsProvider';
import { cn } from '@/lib/utils';
import {
  SME_PERIOD_TYPES,
  SME_STATUS_META,
  SME_UNIT_STATUS_META,
  type SmePeriodType,
  type SmeStatus,
  type SmeUnitStatus,
} from '@/lib/sme';

// ---------------------------------------------------------------------------
// Types (mirror /api/sme/performance)
// ---------------------------------------------------------------------------

interface PerfRow {
  subCity: string;
  area: string;
  label: string;
  target: number;
  actual: number;
  achievementPct: number;
  unitStatus: SmeUnitStatus;
  standing: Record<SmeStatus, number>;
  standingTotal: number;
  pending: number;
  operationalRate: number;
  members: number;
  femaleMembers: number;
}

interface PerfData {
  period: { type: string; start: string; end: string; label: string; pacePct: number };
  scope: { level: 'city' | 'subcity'; subCity: string | null };
  cityTarget: number | null;
  cityActual: number | null;
  kpis: {
    totalTarget: number;
    totalRegistered: number;
    achievementPct: number;
    pending: number;
    operational: number;
    standingTotal: number;
    operationalRate: number;
    members: number;
    femaleMembers: number;
    avgMembers: number;
  };
  totals: { byStatus: Record<SmeStatus, number>; standingTotal: number };
  rows: PerfRow[];
}

interface SmeRecord {
  id: string;
  enterpriseName: string;
  enterpriseType: string;
  subCity: string;
  area: string;
  employeeCount: number;
  femaleEmployees: number;
  status: string;
  createdAt: string;
}

const fmt = (n: number) => n.toLocaleString('en');
const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ccf1ea',
  boxShadow: '0 8px 24px -8px rgba(13,148,136,0.35)',
  fontSize: 12,
};

export default function SmePerformanceDashboard() {
  const { toast } = useToast();
  const { subCities } = useSettings();

  const [periodType, setPeriodType] = React.useState<SmePeriodType>('yearly');
  const [refDate, setRefDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [levelScope, setLevelScope] = React.useState('all'); // 'all' = city overview
  const [data, setData] = React.useState<PerfData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  // Click-through detail dialog
  const [detailUnit, setDetailUnit] = React.useState<{ subCity: string; area: string; label: string } | null>(null);
  const [detailSmes, setDetailSmes] = React.useState<SmeRecord[] | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ periodType, ref: refDate });
    if (levelScope !== 'all') params.set('subCity', levelScope);
    fetch(`/api/sme/performance?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((json) => setData(json))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [periodType, refDate, levelScope]);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Open the click-through detail for one administrative unit. */
  const openDetail = (row: { subCity: string; area: string; label: string }) => {
    setDetailUnit(row);
    setDetailSmes(null);
    setDetailLoading(true);
    const params = new URLSearchParams({ subCity: row.subCity, limit: '200' });
    if (row.area) params.set('area', row.area);
    fetch(`/api/smallenterprises?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((json) => setDetailSmes(json.data ?? []))
      .catch(() => {
        setDetailSmes([]);
        toast({ title: 'Error', description: 'Could not load the enterprise list', variant: 'destructive' });
      })
      .finally(() => setDetailLoading(false));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mx-auto max-w-md rounded-2xl border-amber-200">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm font-medium text-teal-950">Could not load the performance dashboard. Check the connection and try again.</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isCityOverview = data.scope.level === 'city';
  const statusChartData = (Object.keys(data.totals.byStatus) as SmeStatus[]).map((s) => ({
    name: SME_STATUS_META[s].label,
    value: data.totals.byStatus[s],
    color: SME_STATUS_META[s].color,
  }));
  const targetChartData = data.rows.map((r) => ({
    label: r.label,
    Target: r.target,
    Registered: r.actual,
  }));
  const pipelineChartData = data.rows.map((r) => ({
    label: r.label,
    Registered: r.standing.REGISTERED,
    'Fully Legalized': r.standing.FULLY_LEGALIZED,
    'Awaiting Operation': r.standing.AWAITING_OPERATION,
    Operational: r.standing.OPERATIONAL,
  }));

  return (
    <div className="animate-fade-up mx-auto max-w-5xl space-y-4">
      {/* ============ Controls ============ */}
      <Card className="rounded-2xl border-teal-100">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            SME Performance Dashboard
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            {isCityOverview
              ? 'City-level accountability — targets vs achievements per sub-city. Click any row for details.'
              : `Woreda-level accountability within ${data.scope.subCity} — click any row for details.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as SmePeriodType)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SME_PERIOD_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>{p === 'monthly' ? 'Monthly' : p === 'quarterly' ? 'Quarterly' : 'Yearly'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sme-perf-ref" className="text-xs">Date in Period</Label>
            <Input id="sme-perf-ref" type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Level</Label>
            <Select value={levelScope} onValueChange={setLevelScope}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">City overview (all sub-cities)</SelectItem>
                {subCities.map((sc) => (
                  <SelectItem key={sc.name} value={sc.name}>{sc.name} — woredas</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">
            {data.period.label} · {data.period.pacePct}% of the period elapsed
            {levelScope === 'all' && data.cityTarget != null && (
              <> · City-wide target: <span className="font-semibold text-teal-900">{fmt(data.cityTarget)}</span> enterprises, registered <span className="font-semibold text-teal-900">{fmt(data.cityActual ?? 0)}</span> ({data.cityTarget > 0 ? Math.round(((data.cityActual ?? 0) / data.cityTarget) * 1000) / 10 : 0}%)</>
            )}
          </p>
        </CardContent>
      </Card>

      {/* ============ KPI cards ============ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={<Target className="h-4 w-4" />} label={data.kpis.totalTarget > 0 ? 'Assigned Target' : 'No Target Set'} value={fmt(data.kpis.totalTarget)} sub="enterprises to establish" />
        <KpiCard icon={<Store className="h-4 w-4" />} label="Registered" value={fmt(data.kpis.totalRegistered)} sub={`in ${data.period.label.toLowerCase()}`} />
        <KpiCard icon={<Gauge className="h-4 w-4" />} label="Achievement" value={`${data.kpis.achievementPct}%`} sub="of assigned targets" highlight={data.kpis.achievementPct >= 100 ? 'emerald' : data.kpis.achievementPct >= 60 ? 'teal' : 'red'} />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pending SMEs" value={fmt(data.kpis.pending)} sub="not yet operational" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Operational" value={fmt(data.kpis.operational)} sub={`${data.kpis.operationalRate}% of standing`} highlight="emerald" />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Members" value={fmt(data.kpis.members)} sub={`avg ${fmt(data.kpis.avgMembers)} per SME · F ${fmt(data.kpis.femaleMembers)}`} />
      </div>

      {data.kpis.standingTotal === 0 && data.kpis.totalTarget === 0 ? (
        <Card className="rounded-2xl border-teal-100">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Store className="h-10 w-10 text-teal-300" />
            <p className="font-semibold text-teal-950">No targets or enterprises for {data.period.label}</p>
            <p className="text-sm text-muted-foreground">Set establishment targets and register SMEs to see the analysis.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ============ Charts ============ */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Target vs Registered</CardTitle>
                <CardDescription>Establishment target and registrations per {isCityOverview ? 'sub-city' : 'woreda'} — {data.period.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetChartData} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Target" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={22} />
                      <Bar dataKey="Registered" fill="#0d9488" radius={[6, 6, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Overall Establishment Pipeline</CardTitle>
                <CardDescription>Current standing of all registered SMEs in scope</CardDescription>
              </CardHeader>
              <CardContent className="flex h-64 items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                      {statusChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${v} enterprises`, 'Count']} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="card-lift rounded-2xl border-teal-100 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Operational Progress by {isCityOverview ? 'Sub-City' : 'Woreda'}</CardTitle>
                <CardDescription>Status pipeline of the SMEs registered under each unit (standing today)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pipelineChartData} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {(['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'] as SmeStatus[]).map((s) => (
                        <Bar
                          key={s}
                          dataKey={SME_STATUS_META[s].label}
                          stackId="pipe"
                          fill={SME_STATUS_META[s].color}
                          barSize={26}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ============ Accountability table (click a row for details) ============ */}
          <Card className="rounded-2xl border-teal-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Accountability per {isCityOverview ? 'Sub-City' : 'Woreda'}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Click a row to see the unit&apos;s target summary and its registered enterprises
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-teal-100 text-[10px] uppercase tracking-wide text-teal-900/60">
                    <th className="py-2 pr-2 font-semibold">Unit</th>
                    <th className="py-2 pr-2 text-right font-semibold">Target</th>
                    <th className="py-2 pr-2 text-right font-semibold">Registered</th>
                    <th className="py-2 pr-2 font-semibold">Achievement</th>
                    <th className="py-2 pr-2 text-right font-semibold">Pending</th>
                    <th className="py-2 pr-2 text-right font-semibold">Operational</th>
                    <th className="py-2 pr-2 text-right font-semibold">Members</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2 font-semibold"><span className="sr-only">Details</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const statusMeta = SME_UNIT_STATUS_META[r.unitStatus];
                    return (
                      <tr
                        key={`${r.subCity}||${r.area}`}
                        className="cursor-pointer border-b border-teal-50 transition-colors last:border-b-0 hover:bg-teal-50/60"
                        onClick={() => openDetail(r)}
                        title="View details"
                      >
                        <td className="py-2.5 pr-2 font-semibold text-teal-950">{r.label}</td>
                        <td className="py-2.5 pr-2 text-right">
                          {r.target > 0 ? fmt(r.target) : <span className="text-[10px] italic text-amber-600">not set</span>}
                        </td>
                        <td className="py-2.5 pr-2 text-right font-semibold">{fmt(r.actual)}</td>
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-teal-50">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  r.unitStatus === 'achieved' ? 'bg-emerald-500'
                                    : r.unitStatus === 'behind' || r.unitStatus === 'missed' ? 'bg-red-400'
                                      : r.unitStatus === 'no_target' ? 'bg-slate-300' : 'bg-teal-500'
                                )}
                                style={{ width: `${Math.min(r.achievementPct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium text-teal-900">{r.target > 0 ? `${r.achievementPct}%` : '—'}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 text-right">{fmt(r.pending)}</td>
                        <td className="py-2.5 pr-2 text-right">
                          {fmt(r.standing.OPERATIONAL)} <span className="text-[10px] text-muted-foreground">({r.operationalRate}%)</span>
                        </td>
                        <td className="py-2.5 pr-2 text-right">{fmt(r.members)}</td>
                        <td className="py-2.5 pr-2">
                          <Badge variant="outline" className={cn('text-[10px]', statusMeta.badgeClass)}>{statusMeta.label}</Badge>
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 text-teal-700">
                            <Eye className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-muted-foreground">
                        No {isCityOverview ? 'sub-cities' : 'woredas'} configured yet — add locations in Settings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="pb-2 text-center text-[11px] text-teal-900/45">
            Small Enterprise (MSE) registration & performance monitoring — Dhibayyuu Sub-City
          </p>
        </>
      )}

      {/* ============ Click-through detail dialog ============ */}
      <Dialog open={!!detailUnit} onOpenChange={(open) => { if (!open) setDetailUnit(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-teal-700" />
              {detailUnit?.label}
              <span className="text-xs font-normal text-muted-foreground">
                {detailUnit && (detailUnit.area ? `woreda of ${detailUnit.subCity}` : 'sub-city')}
              </span>
            </DialogTitle>
            <DialogDescription>
              Performance detail — {data.period.label}
            </DialogDescription>
          </DialogHeader>

          {detailUnit && (() => {
            const row = data.rows.find((r) => r.subCity === detailUnit.subCity && r.area === detailUnit.area);
            const statusMeta = row ? SME_UNIT_STATUS_META[row.unitStatus] : null;
            return (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Target" value={row && row.target > 0 ? fmt(row.target) : 'Not set'} />
                  <MiniStat label="Registered" value={row ? fmt(row.actual) : '—'} />
                  <MiniStat label="Achievement" value={row && row.target > 0 ? `${row.achievementPct}%` : '—'} />
                  <MiniStat label="Pending" value={row ? fmt(row.pending) : '—'} />
                </div>
                {row && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={cn('text-[10px]', statusMeta?.badgeClass)}>{statusMeta?.label}</Badge>
                    {(['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'] as SmeStatus[]).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SME_STATUS_META[s].color }} />
                        {SME_STATUS_META[s].label} {fmt(row.standing[s] ?? 0)}
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                      <Users className="h-3 w-3" />{fmt(row.members)} members · F {fmt(row.femaleMembers)}
                    </span>
                    {row.target === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        No target assigned for this period
                      </span>
                    )}
                  </div>
                )}

                {/* Enterprise list */}
                <div className="rounded-xl border border-teal-100">
                  <p className="border-b border-teal-100 bg-teal-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
                    Registered enterprises {detailLoading ? '' : `(${detailSmes?.length ?? 0})`}
                  </p>
                  {detailLoading ? (
                    <div className="space-y-2 p-3">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                    </div>
                  ) : detailSmes && detailSmes.length > 0 ? (
                    <div className="max-h-72 divide-y divide-teal-50 overflow-y-auto">
                      {detailSmes.map((sme) => {
                        const meta = SME_STATUS_META[(sme.status as SmeStatus) in SME_STATUS_META ? (sme.status as SmeStatus) : 'REGISTERED'];
                        return (
                          <div key={sme.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-teal-950">{sme.enterpriseName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {sme.enterpriseType} · {fmt(sme.employeeCount)} members
                                {sme.femaleEmployees > 0 ? ` (F ${fmt(sme.femaleEmployees)})` : ''}
                                {' · '}{new Date(sme.createdAt).toLocaleDateString('en-GB')}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn('shrink-0 text-[10px]', meta.badgeClass)}>{meta.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 p-6 text-center">
                      <Store className="h-7 w-7 text-teal-200" />
                      <p className="text-xs text-muted-foreground">No enterprises registered under this unit yet</p>
                    </div>
                  )}
                </div>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ChevronRight className="h-3 w-3" />
                  Status changes and updates are managed in the SME Records page.
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: 'emerald' | 'teal' | 'red';
}) {
  return (
    <div className="card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'bg-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm',
            highlight === 'emerald' && 'bg-emerald-500',
            highlight === 'red' && 'bg-red-500'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold leading-tight text-teal-950">{value}</p>
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-teal-900/50">{label}</p>
        </div>
      </div>
      <p className="mt-2 truncate text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-teal-900/50">{label}</p>
      <p className="text-sm font-bold text-teal-950">{value}</p>
    </div>
  );
}
