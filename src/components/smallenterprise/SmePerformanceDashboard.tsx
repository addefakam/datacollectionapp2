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
  byType?: PerfTypeRow[];
}

/** One row of the "By Enterprise Type" report (mirrors the API byType). */
interface PerfTypeRow {
  type: string;
  standing: Record<SmeStatus, number>;
  standingTotal: number;
  registeredInPeriod: number;
  members: number;
  femaleMembers: number;
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

  // Click-through detail dialog (accountability table)
  const [detailUnit, setDetailUnit] = React.useState<{ subCity: string; area: string; label: string } | null>(null);
  const [detailSmes, setDetailSmes] = React.useState<SmeRecord[] | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  // Inline detail record opened by clicking a bar of the Target vs Registered chart
  const [chartRow, setChartRow] = React.useState<PerfRow | null>(null);
  const [chartSmes, setChartSmes] = React.useState<SmeRecord[] | null>(null);
  const [chartLoading, setChartLoading] = React.useState(false);

  // Inline detail record opened by clicking a bar of the Operational Progress chart
  const [pipeRow, setPipeRow] = React.useState<PerfRow | null>(null);
  const [pipeSmes, setPipeSmes] = React.useState<SmeRecord[] | null>(null);
  const [pipeLoading, setPipeLoading] = React.useState(false);

  // Record list opened by clicking a KPI card (Registered / Pending / Operational)
  const [kpiPanel, setKpiPanel] = React.useState<'registered' | 'achievement' | 'pending' | 'operational' | null>(null);
  const [kpiSmes, setKpiSmes] = React.useState<SmeRecord[] | null>(null);
  const [kpiLoading, setKpiLoading] = React.useState(false);

  // Record list opened by clicking a row of the By Enterprise Type report
  const [typeDetail, setTypeDetail] = React.useState<{ type: string; smes: SmeRecord[] | null; loading: boolean } | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    // a new scope/period invalidates every opened drill-down
    setChartRow(null);
    setPipeRow(null);
    setKpiPanel(null);
    setTypeDetail(null);
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

  /** Fetch small-enterprise records with query params (drill-down lists). */
  const fetchSmes = (params: Record<string, string>) =>
    fetch(`/api/smallenterprises?${new URLSearchParams(params)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((json) => (json.data ?? []) as SmeRecord[]);

  /** Fetch the registered enterprises of one administrative unit. */
  const fetchUnitSmes = (row: { subCity: string; area: string }) => {
    const params: Record<string, string> = { subCity: row.subCity, limit: '200' };
    if (row.area) params.area = row.area;
    return fetchSmes(params);
  };

  /** Shared failure toast for drill-down loads. */
  const drillLoadError = () =>
    toast({ title: 'Error', description: 'Could not load the enterprise list', variant: 'destructive' });

  /** Open the click-through detail for one administrative unit. */
  const openDetail = (row: { subCity: string; area: string; label: string }) => {
    setDetailUnit(row);
    setDetailSmes(null);
    setDetailLoading(true);
    fetchUnitSmes(row)
      .then((list) => setDetailSmes(list))
      .catch(() => {
        setDetailSmes([]);
        drillLoadError();
      })
      .finally(() => setDetailLoading(false));
  };

  /** Open the inline detail record below the Target vs Registered chart. */
  const openChartDetail = (row: PerfRow) => {
    setChartRow(row);
    setChartSmes(null);
    setChartLoading(true);
    fetchUnitSmes(row)
      .then((list) => setChartSmes(list))
      .catch(() => {
        setChartSmes([]);
        drillLoadError();
      })
      .finally(() => setChartLoading(false));
  };

  /** Open the inline detail record below the Operational Progress chart. */
  const openPipeDetail = (row: PerfRow) => {
    setPipeRow(row);
    setPipeSmes(null);
    setPipeLoading(true);
    fetchUnitSmes(row)
      .then((list) => setPipeSmes(list))
      .catch(() => {
        setPipeSmes([]);
        drillLoadError();
      })
      .finally(() => setPipeLoading(false));
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
  const targetChartData = data.rows.map((r) => ({
    label: r.label,
    Target: r.target,
    Registered: r.actual,
    subCity: r.subCity,
    area: r.area,
  }));

  /** Map a clicked bar (via its datum payload) back to its performance row. */
  const selectChartRow = (entry: { payload?: { subCity?: string; area?: string } }) => {
    const p = entry?.payload;
    if (!p) return;
    const row = data.rows.find((r) => r.subCity === p.subCity && r.area === p.area);
    if (row) openChartDetail(row);
  };
  const selectPipeRow = (entry: { payload?: { subCity?: string; area?: string } }) => {
    const p = entry?.payload;
    if (!p) return;
    const row = data.rows.find((r) => r.subCity === p.subCity && r.area === p.area);
    if (row) openPipeDetail(row);
  };
  const pipelineChartData = data.rows.map((r) => ({
    label: r.label,
    Registered: r.standing.REGISTERED,
    'Fully Legalized': r.standing.FULLY_LEGALIZED,
    'Awaiting Operation': r.standing.AWAITING_OPERATION,
    Operational: r.standing.OPERATIONAL,
    subCity: r.subCity,
    area: r.area,
  }));

  const typeChartData = (data.byType ?? []).map((t) => ({
    type: t.type,
    Registered: t.standing.REGISTERED,
    'Fully Legalized': t.standing.FULLY_LEGALIZED,
    'Awaiting Operation': t.standing.AWAITING_OPERATION,
    Operational: t.standing.OPERATIONAL,
  }));

  /** Open the record list behind a KPI card below the KPI grid. */
  const openKpiPanel = (kind: 'registered' | 'achievement' | 'pending' | 'operational') => {
    if (kpiPanel === kind) {
      setKpiPanel(null);
      return;
    }
    setKpiPanel(kind);
    if (kind === 'achievement') {
      setKpiSmes(null); // per-unit summary, computed from the loaded rows
      setKpiLoading(false);
      return;
    }
    setKpiSmes(null);
    setKpiLoading(true);
    const params: Record<string, string> = { limit: '500' };
    if (data.scope.subCity) params.subCity = data.scope.subCity;
    if (kind === 'pending') params.pending = '1';
    if (kind === 'operational') params.status = 'OPERATIONAL';
    fetchSmes(params)
      .then((list) => {
        if (kind !== 'registered') {
          setKpiSmes(list);
          return;
        }
        const start = new Date(data.period.start).getTime();
        const end = new Date(data.period.end).getTime();
        setKpiSmes(
          list.filter((s) => {
            const t = new Date(s.createdAt).getTime();
            return t >= start && t <= end;
          })
        );
      })
      .catch(() => {
        setKpiSmes([]);
        toast({ title: 'Error', description: 'Could not load the record list', variant: 'destructive' });
      })
      .finally(() => setKpiLoading(false));
  };

  /** Toggle the record list of one enterprise type under the type report. */
  const openTypeDetail = (type: string) => {
    if (typeDetail?.type === type) {
      setTypeDetail(null);
      return;
    }
    setTypeDetail({ type, smes: null, loading: true });
    const params: Record<string, string> = { enterpriseType: type, limit: '200' };
    if (data.scope.subCity) params.subCity = data.scope.subCity;
    fetchSmes(params)
      .then((list) => setTypeDetail({ type, smes: list, loading: false }))
      .catch(() => {
        setTypeDetail({ type, smes: [], loading: false });
        drillLoadError();
      });
  };

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
        <KpiCard icon={<Store className="h-4 w-4" />} label="Registered" value={fmt(data.kpis.totalRegistered)} sub={`in ${data.period.label.toLowerCase()}`} onClick={() => openKpiPanel('registered')} title="Click to view the registered records" />
        <KpiCard icon={<Gauge className="h-4 w-4" />} label="Achievement" value={`${data.kpis.achievementPct}%`} sub="of assigned targets" highlight={data.kpis.achievementPct >= 100 ? 'emerald' : data.kpis.achievementPct >= 60 ? 'teal' : 'red'} onClick={() => openKpiPanel('achievement')} title="Click to view achievement per unit" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pending SMEs" value={fmt(data.kpis.pending)} sub="not yet operational" onClick={() => openKpiPanel('pending')} title="Click to view the pending records" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Operational" value={fmt(data.kpis.operational)} sub={`${data.kpis.operationalRate}% of standing`} highlight="emerald" onClick={() => openKpiPanel('operational')} title="Click to view the operational records" />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Members" value={fmt(data.kpis.members)} sub={`avg ${fmt(data.kpis.avgMembers)} per SME · F ${fmt(data.kpis.femaleMembers)}`} />
      </div>

      {/* ============ KPI drill-down record list ============ */}
      {kpiPanel && (
        <Card className="rounded-2xl border-teal-100">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm sm:text-base">
                {kpiPanel === 'registered' && <>Registered in {data.period.label} {kpiLoading ? '' : `(${kpiSmes?.length ?? 0})`}</>}
                {kpiPanel === 'achievement' && <>Achievement per {isCityOverview ? 'sub-city' : 'woreda'} — {data.period.label}</>}
                {kpiPanel === 'pending' && <>Pending SMEs — not yet operational {kpiLoading ? '' : `(${kpiSmes?.length ?? 0})`}</>}
                {kpiPanel === 'operational' && <>Operational SMEs {kpiLoading ? '' : `(${kpiSmes?.length ?? 0})`}</>}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setKpiPanel(null)} className="h-7 px-2 text-[11px]">
                Close
              </Button>
            </div>
            <CardDescription className="text-xs">
              {kpiPanel === 'registered' && `Enterprises registered during ${data.period.label}`}
              {kpiPanel === 'achievement' && 'Target vs registrations per administrative unit — click a row for its full record'}
              {kpiPanel === 'pending' && 'Registered, legalized or awaiting operation — production not started yet'}
              {kpiPanel === 'operational' && 'Currently producing or trading'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kpiPanel === 'achievement' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-teal-100 text-[10px] uppercase tracking-wide text-teal-900/60">
                      <th className="py-2 pr-2 font-semibold">Unit</th>
                      <th className="py-2 pr-2 text-right font-semibold">Target</th>
                      <th className="py-2 pr-2 text-right font-semibold">Registered</th>
                      <th className="py-2 pr-2 font-semibold">Achievement</th>
                      <th className="py-2 font-semibold"><span className="sr-only">Details</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr
                        key={`kpi-${r.subCity}||${r.area}`}
                        className="cursor-pointer border-b border-teal-50 transition-colors last:border-b-0 hover:bg-teal-50/60"
                        onClick={() => openDetail(r)}
                        title="View details"
                      >
                        <td className="py-2 pr-2 font-semibold text-teal-950">{r.label}</td>
                        <td className="py-2 pr-2 text-right">{r.target > 0 ? fmt(r.target) : <span className="text-[10px] italic text-amber-600">not set</span>}</td>
                        <td className="py-2 pr-2 text-right font-semibold">{fmt(r.actual)}</td>
                        <td className="py-2 pr-2">
                          <span className="text-[11px] font-medium text-teal-900">{r.target > 0 ? `${r.achievementPct}%` : '—'}</span>
                          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-teal-50">
                            <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(r.achievementPct, 100)}%` }} />
                          </div>
                        </td>
                        <td className="py-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 text-teal-700">
                            <Eye className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : kpiLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : (
              <EnterpriseListBlock loading={false} smes={kpiSmes} emptyText="No records found for this card" />
            )}
          </CardContent>
        </Card>
      )}

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
            <Card className="card-lift rounded-2xl border-teal-100 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Target vs Registered</CardTitle>
                <CardDescription>
                  Establishment target and registrations per {isCityOverview ? 'sub-city' : 'woreda'} — {data.period.label}.
                  Click a bar to open its detail record below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 [&_.recharts-bar-rectangle]:cursor-pointer">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetChartData} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="Target"
                        fill="#f59e0b"
                        radius={[6, 6, 0, 0]}
                        barSize={22}
                        cursor="pointer"
                        onClick={(entry: { payload?: { subCity: string; area: string } }) => selectChartRow(entry)}
                      />
                      <Bar
                        dataKey="Registered"
                        fill="#0d9488"
                        radius={[6, 6, 0, 0]}
                        barSize={22}
                        cursor="pointer"
                        onClick={(entry: { payload?: { subCity: string; area: string } }) => selectChartRow(entry)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Inline detail record for the clicked bar */}
                {chartRow && (
                  <UnitDrillPanel
                    row={chartRow}
                    periodLabel={data.period.label}
                    loading={chartLoading}
                    smes={chartSmes}
                    onClose={() => setChartRow(null)}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="card-lift rounded-2xl border-teal-100 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Operational Progress by {isCityOverview ? 'Sub-City' : 'Woreda'}</CardTitle>
                <CardDescription>
                  Status pipeline of the SMEs registered under each unit (standing today).
                  Click a bar to open its detail record below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 [&_.recharts-bar-rectangle]:cursor-pointer">
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
                          cursor="pointer"
                          onClick={(entry: { payload?: { subCity: string; area: string } }) => selectPipeRow(entry)}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Inline detail record for the clicked unit */}
                {pipeRow && (
                  <UnitDrillPanel
                    row={pipeRow}
                    periodLabel={data.period.label}
                    loading={pipeLoading}
                    smes={pipeSmes}
                    onClose={() => setPipeRow(null)}
                  />
                )}
              </CardContent>
            </Card>

            {/* ============ By Enterprise Type report ============ */}
            <Card className="card-lift rounded-2xl border-teal-100 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Enterprise Type</CardTitle>
                <CardDescription>
                  Standing pipeline per enterprise type in scope — registered-in-period, stage breakdown and members.
                  Click a bar or a row to see its records below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {typeChartData.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No enterprise records in scope yet</p>
                ) : (
                  <>
                    <div className="h-56 [&_.recharts-bar-rectangle]:cursor-pointer">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={typeChartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 12 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                          <YAxis type="category" dataKey="type" width={110} tick={{ fontSize: 10, fill: '#134e4a' }} />
                          <Tooltip contentStyle={chartTooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {(['REGISTERED', 'FULLY_LEGALIZED', 'AWAITING_OPERATION', 'OPERATIONAL'] as SmeStatus[]).map((s) => (
                            <Bar
                              key={s}
                              dataKey={SME_STATUS_META[s].label}
                              stackId="type"
                              fill={SME_STATUS_META[s].color}
                              barSize={14}
                              cursor="pointer"
                              onClick={(entry: { payload?: { type?: string } }) => {
                                const t = entry?.payload?.type;
                                if (t) openTypeDetail(t);
                              }}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-teal-100 text-[10px] uppercase tracking-wide text-teal-900/60">
                            <th className="py-2 pr-2 font-semibold">Enterprise Type</th>
                            <th className="py-2 pr-2 text-right font-semibold">Registered ({data.period.label})</th>
                            <th className="py-2 pr-2 text-right font-semibold">Registered</th>
                            <th className="py-2 pr-2 text-right font-semibold">Legalized</th>
                            <th className="py-2 pr-2 text-right font-semibold">Awaiting</th>
                            <th className="py-2 pr-2 text-right font-semibold">Operational</th>
                            <th className="py-2 pr-2 text-right font-semibold">Total</th>
                            <th className="py-2 pr-2 text-right font-semibold">Members</th>
                            <th className="py-2 font-semibold"><span className="sr-only">Details</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.byType ?? []).map((t) => (
                            <tr
                              key={`type-${t.type}`}
                              className="cursor-pointer border-b border-teal-50 transition-colors last:border-b-0 hover:bg-teal-50/60"
                              onClick={() => openTypeDetail(t.type)}
                              title="View records of this type"
                            >
                              <td className="py-2.5 pr-2 font-semibold text-teal-950">{t.type}</td>
                              <td className="py-2.5 pr-2 text-right">{fmt(t.registeredInPeriod)}</td>
                              <td className="py-2.5 pr-2 text-right">{fmt(t.standing.REGISTERED)}</td>
                              <td className="py-2.5 pr-2 text-right">{fmt(t.standing.FULLY_LEGALIZED)}</td>
                              <td className="py-2.5 pr-2 text-right">{fmt(t.standing.AWAITING_OPERATION)}</td>
                              <td className="py-2.5 pr-2 text-right font-semibold">{fmt(t.standing.OPERATIONAL)}</td>
                              <td className="py-2.5 pr-2 text-right font-semibold text-teal-900">{fmt(t.standingTotal)}</td>
                              <td className="py-2.5 pr-2 text-right">
                                {fmt(t.members)} <span className="text-[10px] text-muted-foreground">(F {fmt(t.femaleMembers)})</span>
                              </td>
                              <td className="py-2.5">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 text-teal-700">
                                  <Eye className="h-3.5 w-3.5" />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Records of the clicked enterprise type */}
                {typeDetail && (
                  <div className="overflow-hidden rounded-xl border border-teal-100 bg-white">
                    <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-teal-50/60 px-3 py-2">
                      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
                        {typeDetail.type} — records {typeDetail.loading ? '' : `(${typeDetail.smes?.length ?? 0})`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setTypeDetail(null)}
                        className="shrink-0 rounded-md border border-teal-200 bg-white px-2 py-1 text-[10px] font-medium text-teal-700 transition-colors hover:bg-teal-50"
                      >
                        Close
                      </button>
                    </div>
                    <EnterpriseListBlock loading={typeDetail.loading} smes={typeDetail.smes} emptyText="No records of this type in scope yet" />
                  </div>
                )}
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
            return (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat label="Target" value={row && row.target > 0 ? fmt(row.target) : 'Not set'} />
                  <MiniStat label="Registered" value={row ? fmt(row.actual) : '—'} />
                  <MiniStat label="Achievement" value={row && row.target > 0 ? `${row.achievementPct}%` : '—'} />
                  <MiniStat label="Pending" value={row ? fmt(row.pending) : '—'} />
                </div>
                {row && <UnitStatusChips row={row} />}

                {/* Enterprise list */}
                <div className="rounded-xl border border-teal-100">
                  <p className="border-b border-teal-100 bg-teal-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
                    Registered enterprises {detailLoading ? '' : `(${detailSmes?.length ?? 0})`}
                  </p>
                  <EnterpriseListBlock loading={detailLoading} smes={detailSmes} />
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
  onClick,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  highlight?: 'emerald' | 'teal' | 'red';
  /** When set, the card opens its record list below the KPI grid. */
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div
      className={cn(
        'card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm',
        onClick && 'cursor-pointer transition-colors hover:border-teal-300 hover:shadow-md'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={title}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={title}
    >
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
        {onClick && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-teal-700/50" />}
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

/** Standing chips (status pipeline, members, target flag) of one administrative unit. */
function UnitStatusChips({ row }: { row: PerfRow }) {
  const statusMeta = SME_UNIT_STATUS_META[row.unitStatus];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={cn('text-[10px]', statusMeta.badgeClass)}>{statusMeta.label}</Badge>
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
  );
}

/** Body of the "Registered enterprises" box (loading skeleton, list or empty state). */
function EnterpriseListBlock({
  loading,
  smes,
  emptyText = 'No enterprises registered under this unit yet',
}: {
  loading: boolean;
  smes: SmeRecord[] | null;
  emptyText?: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    );
  }
  if (smes && smes.length > 0) {
    return (
      <div className="max-h-72 divide-y divide-teal-50 overflow-y-auto">
        {smes.map((sme) => {
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
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5 p-6 text-center">
      <Store className="h-7 w-7 text-teal-200" />
      <p className="text-xs text-muted-foreground">{emptyText}</p>
    </div>
  );
}

/** Inline drill-down record shown under a clicked chart bar: unit summary + enterprises. */
function UnitDrillPanel({
  row,
  periodLabel,
  loading,
  smes,
  onClose,
}: {
  row: PerfRow;
  periodLabel: string;
  loading: boolean;
  smes: SmeRecord[] | null;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-teal-100 bg-teal-50/40">
      <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-white/70 px-3 py-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-teal-950">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" />
          <span className="truncate">{row.label}</span>
          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
            {row.area ? `woreda of ${row.subCity}` : 'sub-city'} · {periodLabel}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-teal-200 bg-white px-2 py-1 text-[10px] font-medium text-teal-700 transition-colors hover:bg-teal-50"
        >
          Close
        </button>
      </div>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Target" value={row.target > 0 ? fmt(row.target) : 'Not set'} />
          <MiniStat label="Registered" value={fmt(row.actual)} />
          <MiniStat label="Achievement" value={row.target > 0 ? `${row.achievementPct}%` : '—'} />
          <MiniStat label="Pending" value={fmt(row.pending)} />
        </div>
        <UnitStatusChips row={row} />
        <div className="rounded-xl border border-teal-100 bg-white">
          <p className="border-b border-teal-100 bg-teal-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-teal-900/70">
            Registered enterprises {loading ? '' : `(${smes?.length ?? 0})`}
          </p>
          <EnterpriseListBlock loading={loading} smes={smes} />
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ChevronRight className="h-3 w-3" />
          Status changes and updates are managed in the SME Records page.
        </p>
      </div>
    </div>
  );
}
