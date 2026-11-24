'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import {
  BarChart3,
  Loader2,
  RefreshCw,
  Rocket,
  CheckCircle2,
  Clock,
  TriangleAlert,
  Target,
  TrendingUp,
  Users,
  Building2,
  FileText,
  CalendarCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATUS_CONFIG, statusStyle, pct } from '@/lib/initiative-monitor';

interface DashboardProps {
  refreshTrigger: number;
}

interface StatsPayload {
  overview: {
    initiatives: number;
    fullyOperational: number;
    completionRatePct: number;
    attainmentPct: number | null;
    totalTarget: number;
    achievedTotal: number;
    gap: number;
    delayedCount: number;
    onTrackCount: number;
    reportsLast7Days: number;
    behindOnReports: number;
    avgDaysSinceReport: number | null;
  };
  departments: {
    departmentId: string;
    group: string;
    initiatives: number;
    fullyOperational: number;
    completionRatePct: number;
    totalTarget: number;
    achievedTotal: number;
    attainmentPct: number | null;
    gap: number;
    delayedCount: number;
    behindOnReports: number;
    avgDaysSinceReport: number | null;
    reportsLast7Days: number;
  }[];
  subCities: { group: string; initiatives: number; fullyOperational: number; completionRatePct: number; delayedCount: number }[];
  statusDistribution: Record<string, number>;
  delayed: {
    id: string;
    name: string;
    departmentName: string;
    subCity: string;
    status: string;
    expectedOperationalDate: string | null;
    delayDays: number;
    attainmentPct: number | null;
    daysSinceLastReport: number | null;
  }[];
  needsAttention: {
    id: string;
    name: string;
    departmentName: string;
    status: string;
    daysSinceLastReport: number | null;
    overdueTargets: number;
    attainmentPct: number | null;
  }[];
  trend: { date: string; reports: number; achieved: number }[];
  recentReports: {
    id: string;
    initiativeId: string;
    initiativeName: string;
    departmentName: string;
    reportDate: string;
    activities: string;
    achievedValue: number | null;
    reportedByName: string | null;
  }[];
  targetVsActual: { department: string; target: number; actual: number; gap: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  PROPOSED: '#94a3b8',
  APPROVED: '#8b5cf6',
  IN_PROGRESS: '#f59e0b',
  FULLY_OPERATIONAL: '#10b981',
  ON_HOLD: '#f97316',
  CANCELLED: '#f43f5e',
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Rocket;
  label: string;
  value: string | number;
  sub?: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    sky: 'bg-sky-50 text-sky-800 border-sky-200',
    violet: 'bg-violet-50 text-violet-900 border-violet-200',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{value}</p>
      {sub && <p className="text-[10px] opacity-75 sm:text-[11px]">{sub}</p>}
    </div>
  );
}

export default function InitiativeDashboard({ refreshTrigger }: DashboardProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/initiatives/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch {
      toast({ title: 'Failed to load dashboard', description: 'Could not reach the server.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [refreshTrigger]);

  // real-time: refresh every 60s and when the tab becomes visible again
  useEffect(() => {
    const timer = setInterval(load, 60000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (loading && !stats) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Computing performance analysis…
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  const o = stats.overview;
  const pieData = Object.entries(stats.statusDistribution).map(([status, count]) => ({
    name: statusStyle(status).label,
    value: count,
    color: STATUS_COLORS[status] ?? '#94a3b8',
  }));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
              <BarChart3 className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
              <span className="leading-tight">Adii Quaamaa<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Initiative performance dashboard</span></span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="shrink-0">
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            Target vs. actual, gaps, delays and completion — updated automatically every minute.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={Rocket} label="Initiatives" value={o.initiatives} sub={`${o.onTrackCount} on track`} tone="violet" />
            <StatCard icon={CheckCircle2} label="Operational" value={o.fullyOperational} sub={`${pct(o.completionRatePct)} completion`} tone="emerald" />
            <StatCard icon={Target} label="Attainment" value={pct(o.attainmentPct)} sub={`${Math.round(o.achievedTotal * 10) / 10} of ${Math.round(o.totalTarget * 10) / 10} target`} tone="sky" />
            <StatCard icon={TrendingUp} label="Gap to target" value={Math.round(o.gap * 10) / 10} sub="quantity remaining" tone="amber" />
            <StatCard icon={Clock} label="Delayed" value={o.delayedCount} sub="past expected date" tone="rose" />
            <StatCard icon={CalendarCheck} label="Reports / 7d" value={o.reportsLast7Days} sub={`${o.behindOnReports} initiative${o.behindOnReports === 1 ? '' : 's'} owe a report`} tone="emerald" />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Target vs actual by department */}
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-emerald-600" /> Target vs. actual by department
              </p>
              {stats.targetVsActual.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No departments with initiatives yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.targetVsActual} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="department" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={54} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="gap" name="Gap" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Status distribution + trend */}
            <div className="space-y-3">
              <div className="rounded-xl border bg-white p-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Rocket className="h-4 w-4 text-emerald-600" /> Lifecycle status
                </p>
                {pieData.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No initiatives yet.</p>
                ) : (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-emerald-600" /> Daily reports — last 14 days
                </p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.trend} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="reports" name="Reports" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Department accountability table */}
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Users className="h-4 w-4 text-emerald-600" /> Department accountability
            </p>
            {stats.departments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No departments with initiatives yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                      <th className="py-2 pr-2 font-semibold">Department</th>
                      <th className="py-2 pr-2 font-semibold">Init.</th>
                      <th className="py-2 pr-2 font-semibold">Operational</th>
                      <th className="py-2 pr-2 font-semibold">Attainment</th>
                      <th className="py-2 pr-2 font-semibold">Gap</th>
                      <th className="py-2 pr-2 font-semibold">Late</th>
                      <th className="py-2 pr-2 font-semibold">Last report</th>
                      <th className="py-2 font-semibold">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.departments.map((d) => (
                      <tr key={d.departmentId} className="border-b last:border-0">
                        <td className="max-w-48 truncate py-2 pr-2 font-medium">{d.group}</td>
                        <td className="py-2 pr-2">{d.initiatives}</td>
                        <td className="py-2 pr-2">{d.fullyOperational} ({pct(d.completionRatePct)})</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1.5">
                            <Progress value={Math.min(100, d.attainmentPct ?? 0)} className="h-1.5 w-14" />
                            <span className="font-semibold">{pct(d.attainmentPct)}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-amber-700">{Math.round(d.gap * 10) / 10}</td>
                        <td className="py-2 pr-2">
                          {d.delayedCount > 0 ? (
                            <span className="font-semibold text-rose-600">{d.delayedCount}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          {d.avgDaysSinceReport == null ? (
                            <span className="text-muted-foreground">no reports</span>
                          ) : (
                            `${Math.round(d.avgDaysSinceReport)}d ago (avg)`
                          )}
                        </td>
                        <td className="py-2">
                          {d.behindOnReports > 0 ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                              <TriangleAlert className="h-3 w-3" /> {d.behindOnReports} owe reports
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> up to date
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Delayed + needs attention */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Clock className="h-4 w-4 text-rose-600" /> Delayed initiatives
              </p>
              {stats.delayed.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing delayed — every initiative is inside its timeline.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {stats.delayed.map((d) => (
                    <div key={d.id} className="rounded-lg border border-rose-200 bg-rose-50/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold sm:text-sm">{d.name}</p>
                        <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          +{d.delayDays}d
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.departmentName} · {d.subCity} · expected {d.expectedOperationalDate?.slice(0, 10) ?? '—'} · attainment {pct(d.attainmentPct)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <TriangleAlert className="h-4 w-4 text-amber-600" /> Needs attention (follow-up)
              </p>
              {stats.needsAttention.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">All initiatives reported on time. Continuous follow-up is holding.</p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {stats.needsAttention.map((d) => (
                    <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold sm:text-sm">{d.name}</p>
                        <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                          {d.daysSinceLastReport == null ? 'never reported' : `${d.daysSinceLastReport}d silent`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.departmentName}
                        {d.overdueTargets > 0 && ` · ${d.overdueTargets} overdue target${d.overdueTargets === 1 ? '' : 's'}`}
                        {` · attainment ${pct(d.attainmentPct)}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sub-city breakdown */}
          {stats.subCities.length > 1 && (
            <div className="rounded-xl border bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Rocket className="h-4 w-4 text-emerald-600" /> Sub-city breakdown
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stats.subCities.map((s) => (
                  <div key={s.group} className="rounded-lg border p-2.5">
                    <p className="truncate text-xs font-semibold sm:text-sm">{s.group}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.initiatives} initiative{s.initiatives === 1 ? '' : 's'} · {s.fullyOperational} operational · {s.delayedCount} late
                    </p>
                    <Progress value={s.completionRatePct} className="mt-1.5 h-1.5" />
                    <p className="mt-1 text-[10px] text-muted-foreground">{pct(s.completionRatePct)} completion rate</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent daily reports feed */}
          <div className="rounded-xl border bg-white p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-4 w-4 text-emerald-600" /> Latest daily reports
            </p>
            {stats.recentReports.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No daily reports submitted yet.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {stats.recentReports.map((r) => (
                  <div key={r.id} className="rounded-lg border p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="min-w-0 truncate text-xs font-semibold sm:text-sm">{r.initiativeName}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{r.reportDate.slice(0, 10)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-foreground/80 sm:text-xs">{r.activities}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {r.departmentName} · by {r.reportedByName ?? '—'}
                      {r.achievedValue != null && <span className="ml-1 font-semibold text-emerald-700">+{r.achievedValue}</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isAdmin && (
            <p className="text-center text-[11px] text-muted-foreground">
              Dashboard scope: initiatives of your sub-city. Contact the administrator for department management.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
