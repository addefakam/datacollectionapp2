'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Factory,
  Users,
  Briefcase,
  FileCheck2,
  ChevronDown,
  Loader2,
  MousePointerClick,
  Phone,
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

interface SectorStat {
  sector: string;
  count: number;
  employees: number;
}

interface SubCityStat {
  subCity: string;
  count: number;
  employees: number;
  woredas: { area: string; count: number; employees: number }[];
}

interface WoredaStat {
  subCity: string;
  area: string;
  count: number;
  employees: number;
}

interface EmployeeRangeStat {
  label: string;
  min: number;
  max: number | null;
  count: number;
  employees: number;
}

interface StatsData {
  total: number;
  totalEmployees: number;
  avgEmployees: number;
  withLicense: number;
  sectors: SectorStat[];
  woredas: WoredaStat[];
  employeeRanges: EmployeeRangeStat[];
  subCities: SubCityStat[];
}

interface IndustryRecord {
  id: string;
  establishmentName: string;
  sector: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string | null;
  employeeCount: number;
  contactName: string;
  contactPhone: string;
}

/** One segment of the Sector Distribution chart (category / woreda / employee range). */
interface ChartDatum {
  label: string;
  subLabel?: string;
  count: number;
  employees: number;
  filter: Record<string, string>;
}

type Dimension = 'category' | 'woreda' | 'employees';
type Metric = 'count' | 'employees';

const DIMENSIONS: { value: Dimension; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'woreda', label: 'Woreda' },
  { value: 'employees', label: 'Employees' },
];

const SECTOR_COLORS = [
  '#0d9488', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#ca8a04', '#dc2626', '#2563eb', '#9333ea', '#059669', '#d97706',
  '#be185d', '#4f46e5',
];

const DIM_DESCRIPTION: Record<Dimension, string> = {
  category: 'Industries by sector / Goossa armaan gadii',
  woreda: 'Industries by woreda / Werada armaan gadii',
  employees: 'Industries by number of employees / Lakkoofsa hojjetaa',
};

function buildChartData(dimension: Dimension, stats: StatsData): ChartDatum[] {
  if (dimension === 'category') {
    return [...stats.sectors]
      .sort((a, b) => b.count - a.count)
      .map((s) => ({
        label: s.sector,
        count: s.count,
        employees: s.employees,
        filter: { sector: s.sector },
      }));
  }
  if (dimension === 'woreda') {
    return [...stats.woredas]
      .sort((a, b) => b.count - a.count)
      .map((w) => ({
        label: w.area,
        subLabel: w.subCity,
        count: w.count,
        employees: w.employees,
        filter: { subCity: w.subCity, area: w.area },
      }));
  }
  return stats.employeeRanges.map((r) => ({
    label: r.label,
    count: r.count,
    employees: r.employees,
    filter:
      r.max === null
        ? { minEmployees: String(r.min) }
        : { minEmployees: String(r.min), maxEmployees: String(r.max) },
  }));
}

export default function IndustryStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [dimension, setDimension] = useState<Dimension>('category');
  const [metric, setMetric] = useState<Metric>('count');
  const [expandedSubCities, setExpandedSubCities] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{
    open: boolean;
    title: string;
    sub: string;
    loading: boolean;
    records: IndustryRecord[];
    total: number;
  }>({ open: false, title: '', sub: '', loading: false, records: [], total: 0 });

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [res, attrRes] = await Promise.all([
        fetch('/api/industries/stats'),
        fetch('/api/settings/stats-attribute'),
      ]);
      if (!res.ok) throw new Error();
      setStats(await res.json());
      if (attrRes.ok) {
        const { attribute } = await attrRes.json();
        if (attribute === 'category' || attribute === 'woreda' || attribute === 'employees') {
          setDimension(attribute);
        }
      }
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

  /** Fetch and show the industry records behind a chart segment / breakdown row. */
  const openRecords = useCallback(async (filter: Record<string, string>, title: string, sub: string) => {
    setDialog({ open: true, title, sub, loading: true, records: [], total: 0 });
    try {
      const params = new URLSearchParams({ ...filter, limit: '500', page: '1' });
      const res = await fetch(`/api/industries?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDialog((d) => ({ ...d, loading: false, records: data.data ?? [], total: data.total ?? 0 }));
    } catch {
      setDialog((d) => ({ ...d, loading: false }));
    }
  }, []);

  /** Click on a bar or pie slice → drill into its records. */
  const handleChartClick = (data: unknown) => {
    const e = data as { payload?: ChartDatum & { payload?: ChartDatum } } | undefined;
    const p = e?.payload;
    const datum = p?.filter ? p : p?.payload?.filter ? p.payload : null;
    if (!datum) return;
    const title = dimension === 'employees' ? `${datum.label} Employees` : datum.label;
    const sub =
      dimension === 'woreda'
        ? `Woreda — Sub-city: ${datum.subLabel ?? '—'}`
        : dimension === 'category'
          ? 'Sector / Goossa'
          : 'Employee size range / Safaa hojjetaa';
    openRecords(datum.filter, title, sub);
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
          <Factory className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No statistics available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = buildChartData(dimension, stats);
  const sectorData = [...stats.sectors].sort((a, b) => b.count - a.count);
  const maxCount = sectorData[0]?.count || 1;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-100 sm:h-11 sm:w-11">
              <Factory className="h-4 w-4 text-teal-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.total}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Industries / Indastrii</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 sm:h-11 sm:w-11">
              <Users className="h-4 w-4 text-sky-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.totalEmployees.toLocaleString()}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Employees / Hojjetaa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 sm:h-11 sm:w-11">
              <Briefcase className="h-4 w-4 text-violet-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.sectors.length}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Sectors / Goossa</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-2.5 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 sm:h-11 sm:w-11">
              <FileCheck2 className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight sm:text-2xl">{stats.withLicense}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">Licensed / Eyyamame</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sector Distribution Chart — groupable by category / woreda / employees */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Sector Distribution</CardTitle>
              <CardDescription className="text-xs">{DIM_DESCRIPTION[dimension]}</CardDescription>
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
                        ? 'bg-teal-600 text-white'
                        : 'bg-white text-muted-foreground hover:bg-teal-50 hover:text-teal-700'
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
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-muted-foreground hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  Industries
                </button>
                <button
                  type="button"
                  onClick={() => setMetric('employees')}
                  className={`px-2.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
                    metric === 'employees'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-muted-foreground hover:bg-sky-50 hover:text-sky-700'
                  }`}
                >
                  Employees
                </button>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
          ) : chartType === 'bar' ? (
            <div className="h-[280px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 9 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === 'count' ? [value, 'Industries'] : [value, 'Employees']
                    }
                    labelFormatter={(label) => {
                      const d = chartData.find((x) => x.label === label);
                      const extra = metric === 'count' ? `${d?.employees ?? 0} employees` : `${d?.count ?? 0} industries`;
                      return `${label}${d?.subLabel ? ` — ${d.subLabel}` : ''} · ${extra}`;
                    }}
                    cursor={{ fill: 'rgba(13, 148, 136, 0.08)' }}
                  />
                  <Bar dataKey={metric} radius={[0, 4, 4, 0]} barSize={16} cursor="pointer" onClick={handleChartClick}>
                    {chartData.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
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
                      <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
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
            <MousePointerClick className="h-3 w-3 shrink-0 text-teal-600" />
            Click a bar or slice to view its records / Sararra tuquun daataa ilaalaa
          </p>
        </CardContent>
      </Card>

      {/* Sector Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Sector Breakdown</CardTitle>
          <CardDescription className="text-xs">Count and employment per sector — click to view records</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sectorData.map((s, i) => (
            <button
              key={s.sector}
              type="button"
              onClick={() => openRecords({ sector: s.sector }, s.sector, 'Sector / Goossa')}
              className="block w-full rounded-lg border p-2.5 text-left transition-colors hover:border-teal-300 hover:bg-teal-50/50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                  <span className="truncate text-xs font-medium sm:text-sm">{s.sector}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge className="bg-teal-100 text-[10px] text-teal-700">{s.count} ind.</Badge>
                  <Badge className="bg-sky-100 text-[10px] text-sky-700">{s.employees} emp.</Badge>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-teal-500 transition-all"
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
                          <Badge className="bg-teal-100 text-[10px] text-teal-700">{sc.count} ind.</Badge>
                          <Badge className="bg-sky-100 text-[10px] text-sky-700">{sc.employees} emp.</Badge>
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
                          className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-teal-50/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center justify-between text-xs">
                              <span className="truncate text-muted-foreground">{w.area}</span>
                              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                                <span className="font-semibold text-teal-600">{w.count}</span> ind. · <span className="font-semibold text-sky-600">{w.employees}</span> emp.
                              </span>
                            </div>
                            <div className="h-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-teal-500" style={{ width: `${(w.count / maxWoreda) * 100}%` }} />
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

      {/* Records drill-down dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              {dialog.title}
              <Badge className="bg-teal-100 text-xs text-teal-700">{dialog.total} record{dialog.total === 1 ? '' : 's'}</Badge>
            </DialogTitle>
            <DialogDescription>{dialog.sub}</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            {dialog.loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              </div>
            ) : dialog.records.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No records found</p>
            ) : (
              <div className="space-y-1.5 py-1">
                {dialog.records.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{r.establishmentName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.subCity} — {r.area}{r.specificAddress ? ` · ${r.specificAddress}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge className="bg-teal-100 text-[10px] text-teal-700">{r.sector}</Badge>
                        <Badge className="bg-sky-100 text-[10px] text-sky-700">{r.employeeCount} emp.</Badge>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {r.contactPhone}
                      </span>
                      {r.contactName && <span>{r.contactName}</span>}
                      {r.licenseNumber && <span>License: {r.licenseNumber}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!dialog.loading && dialog.records.length > 0 && (
            <p className="shrink-0 pt-1 text-center text-[10px] text-muted-foreground">
              {dialog.records.length < dialog.total
                ? `Showing first ${dialog.records.length} of ${dialog.total} records`
                : 'End of list'}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
