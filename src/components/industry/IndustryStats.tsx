'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Factory, Users, Briefcase, FileCheck2, ChevronDown } from 'lucide-react';
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

interface StatsData {
  total: number;
  totalEmployees: number;
  avgEmployees: number;
  withLicense: number;
  sectors: SectorStat[];
  subCities: SubCityStat[];
}

const SECTOR_COLORS = [
  '#0d9488', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#ca8a04', '#dc2626', '#2563eb', '#9333ea', '#059669', '#d97706',
  '#be185d', '#4f46e5',
];

export default function IndustryStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [expandedSubCities, setExpandedSubCities] = useState<Set<string>>(new Set());

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/industries/stats');
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

      {/* Sector Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Sector Distribution</CardTitle>
              <CardDescription className="text-xs">Industries by sector / Goossa armaan gadii</CardDescription>
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
        <CardContent>
          {sectorData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
          ) : chartType === 'bar' ? (
            <div className="h-[280px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sectorData.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="sector"
                    tick={{ fontSize: 9 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === 'count' ? [value, 'Industries'] : [value, 'Employees']
                    }
                    labelFormatter={(label) => `Sector: ${label}`}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                    {sectorData.slice(0, 10).map((_, i) => (
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
                    data={sectorData}
                    dataKey="count"
                    nameKey="sector"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    innerRadius={45}
                    paddingAngle={1}
                  >
                    {sectorData.map((_, i) => (
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
        </CardContent>
      </Card>

      {/* Sector Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Sector Breakdown</CardTitle>
          <CardDescription className="text-xs">Count and employment per sector</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sectorData.map((s, i) => (
            <div key={s.sector} className="rounded-lg border p-2.5">
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
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Sub-City Breakdown */}
      {stats.subCities.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">By Sub-City / Kuttaa Maggalaa</CardTitle>
            <CardDescription className="text-xs">Tap to expand woreda details</CardDescription>
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
                        <div key={w.area} className="flex items-center gap-2">
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
                        </div>
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
