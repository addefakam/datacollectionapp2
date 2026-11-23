'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Building2,
  Factory,
  GraduationCap,
  Landmark,
  MapPin,
  RefreshCw,
  Sprout,
  Star,
  Store,
  Stethoscope,
  Tractor,
  Users,
  UsersRound,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types & palette
// ---------------------------------------------------------------------------

interface Overview {
  modules: { key: string; label: string; count: number }[];
  totalRecords: number;
  totals: {
    employees: number;
    maleEmployees: number;
    femaleEmployees: number;
    students: number;
    maleStudents: number;
    femaleStudents: number;
    teachers: number;
    maleTeachers: number;
    femaleTeachers: number;
    healthStaff: number;
    maleStaff: number;
    femaleStaff: number;
    beds: number;
    workers: number;
    maleWorkers: number;
    femaleWorkers: number;
    landHectares: number;
    rooms: number;
    classrooms: number;
    mseEmployees: number;
    mseMaleEmployees: number;
    mseFemaleEmployees: number;
    mseCapital: number;
  };
  people: { male: number; female: number; total: number };
  industrySectors: { label: string; count: number }[];
  educationTypes: { label: string; count: number; students: number }[];
  agricultureTypes: { label: string; count: number }[];
  smallEnterpriseTypes: { label: string; count: number }[];
  hotelLicenseLevels: { label: string; count: number }[];
  healthFacilityTypes: { label: string; count: number }[];
  hotelAmenities: { label: string; count: number; total: number }[];
  healthServices: { label: string; count: number; total: number }[];
  educationFacilities: { label: string; count: number; total: number }[];
  agricultureFeatures: { label: string; count: number; total: number }[];
  subCityCoverage: {
    subCity: string;
    Industry: number;
    Hotel: number;
    Health: number;
    Education: number;
    Agriculture: number;
    'Small Enterprise': number;
    total: number;
  }[];
  monthly: { month: string; Industry: number; Hotel: number; Health: number; Education: number; Agriculture: number; 'Small Enterprise': number }[];
  meetings: number;
  collectors: number;
  avgHotelRating: number;
}

const MODULE_COLORS: Record<string, string> = {
  Industry: '#0d9488',
  Hotel: '#10b981',
  Health: '#f59e0b',
  Education: '#0f766e',
  Agriculture: '#f97316',
  'Small Enterprise': '#7c3aed',
};
const MALE_COLOR = '#0d9488';
const FEMALE_COLOR = '#f59e0b';

const MODULE_ICONS: Record<string, LucideIcon> = {
  industry: Factory,
  hotel: Building2,
  health: Stethoscope,
  education: GraduationCap,
  agriculture: Sprout,
  'small-enterprise': Store,
};

const fmt = (n: number) => n.toLocaleString('en');

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function StatTile({ icon: Icon, label, value, tint }: { icon: LucideIcon; label: string; value: string; tint: string }) {
  return (
    <div className="card-lift flex items-center gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md', tint)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xl font-extrabold leading-tight text-teal-950">{value}</p>
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-teal-900/50">{label}</p>
      </div>
    </div>
  );
}

function ProgressRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium text-teal-950/80">{label}</span>
        <span className="shrink-0 font-semibold text-teal-800">
          {fmt(count)}
          <span className="ml-1 font-normal text-teal-900/45">/ {fmt(total)} · {pct}%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-teal-50">
        <div
          className="bg-brand-gradient h-full rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CountList({ title, icon: Icon, rows, unit }: { title: string; icon: LucideIcon; rows: { label: string; count: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="card-lift rounded-2xl border-teal-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}
        {rows.slice(0, 7).map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-teal-950/80">{r.label}</span>
              <span className="shrink-0 font-semibold text-teal-800">
                {fmt(r.count)}
                {unit && <span className="ml-0.5 font-normal text-teal-900/45">{unit}</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-teal-50">
              <div
                className="h-full rounded-full bg-teal-600/80"
                style={{ width: `${Math.round((r.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ccf1ea',
  boxShadow: '0 8px 24px -8px rgba(13,148,136,0.35)',
  fontSize: 12,
};

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function AnalyticsDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch('/api/analytics/overview')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mx-auto max-w-md rounded-2xl border-amber-200">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium text-teal-950">Could not load analytics. Check the connection and try again.</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });

  // People-by-group stacked bar data
  const peopleGroups = [
    { group: 'Employees', Male: data.totals.maleEmployees, Female: data.totals.femaleEmployees },
    { group: 'MSE Employees', Male: data.totals.mseMaleEmployees, Female: data.totals.mseFemaleEmployees },
    { group: 'Students', Male: data.totals.maleStudents, Female: data.totals.femaleStudents },
    { group: 'Teachers', Male: data.totals.maleTeachers, Female: data.totals.femaleTeachers },
    { group: 'Health Staff', Male: data.totals.maleStaff, Female: data.totals.femaleStaff },
    { group: 'Farm Workers', Male: data.totals.maleWorkers, Female: data.totals.femaleWorkers },
  ].filter((g) => g.Male + g.Female > 0);

  const sexData = [
    { name: 'Male', value: data.people.male },
    { name: 'Female', value: data.people.female },
  ].filter((d) => d.value > 0);

  const empty = data.totalRecords === 0;

  return (
    <div className="animate-fade-up space-y-5">
      {/* ============ Hero banner ============ */}
      <div className="surface-sidebar relative overflow-hidden rounded-3xl border border-teal-950/40 p-5 text-white shadow-xl shadow-teal-950/25 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-100/70">
            <MapPin className="h-3.5 w-3.5" />
            Dhibayyuu Sub-City · Bishoftu City Administration
          </p>
          <h2 className="text-xl font-extrabold leading-tight sm:text-2xl">
            Data Insights &amp; Analytics
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-teal-100/75">
            What the collected survey data tells us — people, establishments, services and coverage across all modules.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
              {fmt(data.totalRecords)} records · {data.modules.length} modules
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
              {fmt(data.people.total)} people counted
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-100/85 ring-1 ring-white/20">
              {data.collectors} collectors · {data.meetings} meetings
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-teal-100/85 ring-1 ring-white/20">
              Updated {today}
            </span>
          </div>
        </div>
      </div>

      {empty ? (
        <Card className="rounded-2xl border-teal-100">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BarChart3 className="h-10 w-10 text-teal-300" />
            <p className="font-semibold text-teal-950">No survey data yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Once collectors submit industry, hotel, health, education or agriculture surveys, insights will appear here automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ============ KPI row ============ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {data.modules.map((m) => {
              const Icon = MODULE_ICONS[m.key] || Landmark;
              return (
                <StatTile
                  key={m.key}
                  icon={Icon}
                  label={`${m.label} records`}
                  value={fmt(m.count)}
                  tint={m.key === 'health' ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-brand-gradient'}
                />
              );
            })}
          </div>

          {/* ============ People & employment ============ */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <UsersRound className="h-4 w-4 text-teal-600" />
                  People Counted, by Sex
                </CardTitle>
                <CardDescription>
                  Employees, students, teachers, health staff and farm workers recorded in the surveys
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-44 w-44 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sexData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                          {sexData.map((d) => (
                            <Cell key={d.name} fill={d.name === 'Male' ? MALE_COLOR : FEMALE_COLOR} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmt(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-3xl font-extrabold text-teal-950">{fmt(data.people.total)}</p>
                    <p className="text-xs text-muted-foreground">total people recorded across all modules</p>
                    {sexData.map((d) => (
                      <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2 font-medium text-teal-950/80">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.name === 'Male' ? MALE_COLOR : FEMALE_COLOR }} />
                          {d.name}
                        </span>
                        <span className="font-semibold text-teal-900">
                          {fmt(d.value)}
                          <span className="ml-1 text-xs font-normal text-teal-900/50">
                            ({data.people.total > 0 ? Math.round((d.value / data.people.total) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-teal-600" />
                  Employment &amp; Enrollment by Sex
                </CardTitle>
                <CardDescription>Male / female split within each recorded group</CardDescription>
              </CardHeader>
              <CardContent>
                {peopleGroups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No sex-disaggregated numbers recorded yet.</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={peopleGroups} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                        <XAxis dataKey="group" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmt(Number(v))} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Male" stackId="sex" fill={MALE_COLOR} radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Female" stackId="sex" fill={FEMALE_COLOR} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-teal-50 p-2">
                    <p className="text-sm font-bold text-teal-900">{fmt(data.totals.employees)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-teal-900/55">Employees</p>
                  </div>
                  <div className="rounded-xl bg-teal-50 p-2">
                    <p className="text-sm font-bold text-teal-900">{fmt(data.totals.mseEmployees)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-teal-900/55">MSE jobs</p>
                  </div>
                  <div className="rounded-xl bg-teal-50 p-2">
                    <p className="text-sm font-bold text-teal-900">{fmt(data.totals.students)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-teal-900/55">Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ============ Business mix ============ */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="card-lift rounded-2xl border-teal-100 xl:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Factory className="h-4 w-4 text-teal-600" />
                  Industry by Sector
                </CardTitle>
                <CardDescription>Registered establishments per sector</CardDescription>
              </CardHeader>
              <CardContent>
                {data.industrySectors.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No industry records yet.</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.industrySectors.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={110}
                          tick={{ fontSize: 9, fill: '#134e4a' }}
                        />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${v} establishments`, 'Count']} />
                        <Bar dataKey="count" fill="#0d9488" radius={[0, 6, 6, 0]} barSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <CountList
              title="Education by Institution Type"
              icon={GraduationCap}
              rows={data.educationTypes.map((t) => ({ label: t.label, count: t.count }))}
              unit=" inst."
            />

            <CountList
              title="Health Facilities by Type"
              icon={Stethoscope}
              rows={data.healthFacilityTypes}
            />

            <CountList title="Farms by Type" icon={Tractor} rows={data.agricultureTypes} />

            <CountList
              title="Small Enterprises by Type"
              icon={Store}
              rows={data.smallEnterpriseTypes}
            />

            <CountList title="Hotels by License Level" icon={Building2} rows={data.hotelLicenseLevels} />

            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4 text-amber-500" />
                  Hospitality Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-teal-50 p-3 text-center">
                  <p className="text-lg font-extrabold text-teal-900">{fmt(data.totals.rooms)}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/55">Guest rooms</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-lg font-extrabold text-amber-700">{data.avgHotelRating || '—'}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700/60">Avg. rating</p>
                </div>
                <div className="rounded-xl bg-teal-50 p-3 text-center">
                  <p className="text-lg font-extrabold text-teal-900">{fmt(data.totals.beds)}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/55">Hospital beds</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-lg font-extrabold text-emerald-700">{fmt(data.totals.landHectares)}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/60">Hectares farmed</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ============ Services & amenities ============ */}
          <Card className="rounded-2xl border-teal-100">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wheat className="h-4 w-4 text-teal-600" />
                Services &amp; Amenities Coverage
              </CardTitle>
              <CardDescription>Share of establishments reporting each service</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-900/55">
                  <Building2 className="h-3.5 w-3.5" /> Hotel amenities
                </p>
                {data.hotelAmenities.map((a) => (
                  <ProgressRow key={a.label} label={a.label} count={a.count} total={a.total} />
                ))}
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-900/55">
                  <Stethoscope className="h-3.5 w-3.5" /> Health services
                </p>
                {data.healthServices.map((a) => (
                  <ProgressRow key={a.label} label={a.label} count={a.count} total={a.total} />
                ))}
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-900/55">
                  <GraduationCap className="h-3.5 w-3.5" /> Education facilities
                </p>
                {data.educationFacilities.map((a) => (
                  <ProgressRow key={a.label} label={a.label} count={a.count} total={a.total} />
                ))}
              </div>
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-900/55">
                  <Sprout className="h-3.5 w-3.5" /> Agriculture features
                </p>
                {data.agricultureFeatures.map((a) => (
                  <ProgressRow key={a.label} label={a.label} count={a.count} total={a.total} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ============ Geographic coverage ============ */}
          <Card className="card-lift rounded-2xl border-teal-100">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-teal-600" />
                Records by Sub-City
              </CardTitle>
              <CardDescription>How survey coverage spreads across sub-cities and modules</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.subCityCoverage} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                    <XAxis dataKey="subCity" tick={{ fontSize: 11, fill: '#134e4a' }} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Industry" stackId="cov" fill={MODULE_COLORS.Industry} />
                    <Bar dataKey="Hotel" stackId="cov" fill={MODULE_COLORS.Hotel} />
                    <Bar dataKey="Health" stackId="cov" fill={MODULE_COLORS.Health} />
                    <Bar dataKey="Education" stackId="cov" fill={MODULE_COLORS.Education} />
                    <Bar dataKey="Agriculture" stackId="cov" fill={MODULE_COLORS.Agriculture} />
                    <Bar dataKey="Small Enterprise" stackId="cov" fill={MODULE_COLORS['Small Enterprise']} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {data.subCityCoverage.map((s) => (
                  <div key={s.subCity} className="rounded-xl border border-teal-100 bg-teal-50/50 p-2.5 text-center">
                    <p className="truncate text-xs font-bold text-teal-900">{s.subCity}</p>
                    <p className="text-lg font-extrabold text-teal-950">{fmt(s.total)}</p>
                    <p className="text-[10px] text-teal-900/50">records</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ============ Monthly trend ============ */}
          <Card className="card-lift rounded-2xl border-teal-100">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-teal-600" />
                Surveys Collected — Last 6 Months
              </CardTitle>
              <CardDescription>Monthly submission trend across all modules</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthly} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                    <defs>
                      {Object.entries(MODULE_COLORS).map(([k, c]) => (
                        <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c} stopOpacity={0.55} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#134e4a' }} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.entries(MODULE_COLORS).map(([k, c]) => (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        stackId="trend"
                        stroke={c}
                        fill={`url(#grad-${k})`}
                        strokeWidth={2}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <p className="pb-2 text-center text-[11px] text-teal-900/45">
            Insights refresh automatically as surveys are collected — shared with the Dhibayyuu Sub-City administration office.
          </p>
        </>
      )}
    </div>
  );
}
