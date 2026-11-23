'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sprout,
  Users,
  Tractor,
  FileBadge,
  ChevronDown,
  Loader2,
  MousePointerClick,
  Phone,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

interface TypeStat {
  farmType: string;
  count: number;
  workers: number;
}

interface SubCityStat {
  subCity: string;
  count: number;
  workers: number;
  woredas: { area: string; count: number; workers: number }[];
}

interface WoredaStat {
  subCity: string;
  area: string;
  count: number;
  workers: number;
}

interface LandRangeStat {
  label: string;
  min: number;
  max: number | null;
  count: number;
  workers: number;
}

interface StatsData {
  total: number;
  totalWorkers: number;
  totalLand: number;
  withLicense: number;
  types: TypeStat[];
  woredas: WoredaStat[];
  landRanges: LandRangeStat[];
  subCities: SubCityStat[];
  /** Uniform chart buckets per groupable attribute (keyed by dimension). */
  attributeBuckets?: Record<string, ChartDatum[]>;
}

interface AgricultureRecord {
  id: string;
  farmName: string;
  farmType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string | null;
  landSizeHectares: number;
  contactName: string;
  contactPhone: string;
}

/** One segment of the Farm Distribution chart (type / woreda / land range). */
interface ChartDatum {
  label: string;
  subLabel?: string;
  count: number;
  workers: number;
  filter: Record<string, string>;
}

type Dimension = string;
type Metric = 'count' | 'workers';

interface DimensionOption {
  value: string;
  label: string;
  description: string;
}

const DIMENSIONS: DimensionOption[] = [
  { value: 'farmType', label: 'Farm Type', description: 'Establishments by farm type / Gosa Qonnaa' },
  { value: 'subCity', label: 'Sub-City', description: 'Establishments by sub-city / Kututtaa Maggalaa' },
  { value: 'woreda', label: 'Wereda', description: 'Establishments by wereda' },
  { value: 'land', label: 'Land Ranges', description: 'Establishments by land size in hectares / Dachaa' },
];

const TYPE_COLORS = [
  '#0284c7', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#ca8a04', '#dc2626', '#2563eb', '#9333ea', '#059669', '#d97706',
  '#be185d', '#4f46e5',
];

function buildChartData(dimension: Dimension, stats: StatsData): ChartDatum[] {
  return stats.attributeBuckets?.[dimension] ?? [];
}

export default function AgricultureStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [dimension, setDimension] = useState<Dimension>(DIMENSIONS[0].value);
  const [metric, setMetric] = useState<Metric>('count');
  const [expandedSubCities, setExpandedSubCities] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{
    open: boolean;
    title: string;
    sub: string;
    loading: boolean;
    records: AgricultureRecord[];
    total: number;
  }>({ open: false, title: '', sub: '', loading: false, records: [], total: 0 });
  const recordsPanelRef = useRef<HTMLDivElement | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agriculturecenters/stats');
      if (!res.ok) throw new Error();
      setStats(await res.json());
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const toggleExpand = (sc: string) => {
    setExpandedSubCities((prev) => {
      const next = new Set(prev);
      if (next.has(sc)) next.delete(sc);
      else next.add(sc);
      return next;
    });
  };

  /** Fetch and show the farm establishment records behind a chart segment / breakdown row. */
  const openRecords = useCallback(async (filter: Record<string, string>, title: string, sub: string) => {
    setDetail({ open: true, title, sub, loading: true, records: [], total: 0 });
    // Bring the records table (rendered below the chart) into view
    requestAnimationFrame(() =>
      recordsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    );
    try {
      const params = new URLSearchParams({ ...filter, limit: '500', page: '1' });
      const res = await fetch(`/api/agriculturecenters?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDetail((d) => ({ ...d, loading: false, records: data.data ?? [], total: data.total ?? 0 }));
    } catch {
      setDetail((d) => ({ ...d, loading: false }));
    }
  }, []);

  /** Click on a bar or pie slice → drill into its records. */
  const handleChartClick = (data: unknown) => {
    const e = data as { payload?: ChartDatum & { payload?: ChartDatum } } | undefined;
    const p = e?.payload;
    const datum = p?.filter ? p : p?.payload?.filter ? p.payload : null;
    if (!datum) return;
    const sub = DIMENSIONS.find((d) => d.value === dimension)?.description ?? '';
    openRecords(datum.filter, datum.label, sub);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Sprout className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No statistics available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = buildChartData(dimension, stats);
  const typeData = [...stats.types].sort((a, b) => b.count - a.count);
  const maxCount = typeData[0]?.count || 1;
  const totalLandDisplay = Number(stats.totalLand.toFixed(1)).toLocaleString();

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 sm:h-11 sm:w-11">
              <Sprout className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.total}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Establishments / Mana Qonnaa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 sm:h-11 sm:w-11">
              <Users className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.totalWorkers.toLocaleString()}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Workers / Hojjetaa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 sm:h-11 sm:w-11">
              <Tractor className="h-4 w-4 text-violet-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{totalLandDisplay}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Land (ha) / Dachaa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
              <FileBadge className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.withLicense}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Licensed / Eyyamame</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Farm Distribution Chart — groupable by type / woreda / land */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Establishment Distribution</CardTitle>
              <CardDescription className="text-xs">
                {DIMENSIONS.find((d) => d.value === dimension)?.description ?? ''}
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setChartType(chartType === 'bar' ? 'pie' : 'bar')}
              className="rounded-lg border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted sm:text-xs"
            >
              {chartType === 'bar' ? 'Pie view' : 'Bar view'}
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Attribution controls: group-by + metric */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Group by</span>
              <div className="flex overflow-hidden rounded-lg border">
                {DIMENSIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDimension(d.value)}
                    className={`px-2.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
                      dimension === d.value
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Show</span>
              <div className="flex overflow-hidden rounded-lg border">
                <button
                  type="button"
                  onClick={() => setMetric('count')}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
                    metric === 'count'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  Count
                </button>
                <button
                  type="button"
                  onClick={() => setMetric('workers')}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
                    metric === 'workers'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-muted-foreground hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  Workers
                </button>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
          ) : chartType === 'bar' ? (
            <div className="h-[280px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData.slice(0, 10)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 9 }}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={64}
                    tickMargin={4}
                  />
                  <YAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} width={44} />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === 'count' ? [value, 'Establishments'] : [value, 'Workers']
                    }
                    labelFormatter={(label) => {
                      const d = chartData.find((x) => x.label === label);
                      const extra = metric === 'count' ? `${d?.workers ?? 0} workers` : `${d?.count ?? 0} establishments`;
                      return `${label}${d?.subLabel ? ` — ${d.subLabel}` : ''} · ${extra}`;
                    }}
                    cursor={{ fill: 'rgba(5, 150, 105, 0.08)' }}
                  />
                  <Bar dataKey={metric} radius={[4, 4, 0, 0]} barSize={22} cursor="pointer" onClick={handleChartClick}>
                    {chartData.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey={metric}
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    paddingAngle={1}
                    cursor="pointer"
                    onClick={handleChartClick}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10 }}
                    layout="horizontal"
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MousePointerClick className="h-3 w-3 shrink-0 text-emerald-600" />
            Click a bar or slice to view its records below / Sararra tuquun daataan jalatti baa&#39;uu
          </p>

          {/* Drill-down records — styled table opened below the chart on click */}
          {detail.open && (
            <div ref={recordsPanelRef} className="overflow-hidden rounded-lg border border-emerald-200">
              <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <span className="truncate">{detail.title}</span>
                    <Badge className="shrink-0 bg-emerald-100 text-[10px] text-emerald-700">
                      {detail.total} record{detail.total === 1 ? '' : 's'}
                    </Badge>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{detail.sub}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail((d) => ({ ...d, open: false }))}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-emerald-100 hover:text-emerald-800"
                  aria-label="Close records"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {detail.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                </div>
              ) : detail.records.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No records found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-emerald-100 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-2.5 py-2 font-semibold">#</th>
                        <th className="px-2.5 py-2 font-semibold">Farm / Mana Qonnaa</th>
                        <th className="px-2.5 py-2 font-semibold">Type / Gosa</th>
                        <th className="px-2.5 py-2 font-semibold">Location</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Land (ha)</th>
                        <th className="px-2.5 py-2 font-semibold">License</th>
                        <th className="px-2.5 py-2 font-semibold">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-muted">
                      {detail.records.map((r, i) => (
                        <tr key={r.id} className="odd:bg-white even:bg-emerald-50/30 transition-colors hover:bg-emerald-50">
                          <td className="px-2.5 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="max-w-[200px] truncate px-2.5 py-2 font-medium">
                            {r.farmName}
                          </td>
                          <td className="px-2.5 py-2">
                            <Badge className="bg-emerald-100 text-[10px] text-emerald-700">{r.farmType}</Badge>
                          </td>
                          <td className="max-w-[180px] truncate px-2.5 py-2 text-muted-foreground">
                            {r.subCity} — {r.area}
                          </td>
                          <td className="px-2.5 py-2 text-right font-semibold text-violet-700">
                            {r.landSizeHectares} ha
                          </td>
                          <td className="px-2.5 py-2 text-muted-foreground">{r.licenseNumber || '—'}</td>
                          <td className="max-w-[160px] truncate px-2.5 py-2 text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {r.contactPhone}
                              {r.contactName ? ` · ${r.contactName}` : ''}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!detail.loading && detail.records.length > 0 && (
                <p className="border-t border-emerald-100 bg-emerald-50/50 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
                  {detail.records.length < detail.total
                    ? `Showing first ${detail.records.length} of ${detail.total} records`
                    : 'End of list / Xumura'}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Farm Type Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Farm Type Breakdown</CardTitle>
          <CardDescription className="text-xs">Count and workers per farm type — click to view records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {typeData.map((s, i) => (
            <button
              key={s.farmType}
              type="button"
              onClick={() => openRecords({ farmType: s.farmType }, s.farmType, 'Farm Type / Gosa Qonnaa')}
              className="block w-full rounded-lg border p-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                  <span className="truncate text-xs font-medium sm:text-sm">{s.farmType}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge className="bg-emerald-100 text-[10px] text-emerald-700">{s.count} est.</Badge>
                  <Badge className="bg-blue-100 text-[10px] text-blue-700">{s.workers} workers</Badge>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Sub-City Breakdown */}
      {stats.subCities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">By Sub-City / Kuttaa Maggalaa</CardTitle>
            <CardDescription className="text-xs">Tap to expand woreda details — click a woreda to view records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.subCities.map((sc) => {
              const isExpanded = expandedSubCities.has(sc.subCity);
              const maxWoreda = Math.max(...sc.woredas.map((w) => w.count), 1);
              return (
                <div key={sc.subCity} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => toggleExpand(sc.subCity)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/30"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{sc.subCity}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge className="bg-emerald-100 text-[10px] text-emerald-700">{sc.count} est.</Badge>
                          <Badge className="bg-blue-100 text-[10px] text-blue-700">{sc.workers} workers</Badge>
                        </div>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-6 space-y-1.5 border-t px-3 pb-2.5 pt-2">
                      {sc.woredas.map((w) => (
                        <button
                          key={w.area}
                          type="button"
                          onClick={() => openRecords({ subCity: sc.subCity, area: w.area }, w.area, `Woreda — Sub-city: ${sc.subCity}`)}
                          className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-emerald-50/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center justify-between text-xs">
                              <span className="truncate text-muted-foreground">{w.area}</span>
                              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                                <span className="font-semibold text-emerald-600">{w.count}</span> est. · <span className="font-semibold text-blue-600">{w.workers}</span> workers
                              </span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(w.count / maxWoreda) * 100}%` }} />
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
