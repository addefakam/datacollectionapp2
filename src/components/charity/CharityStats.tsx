'use client';

import { useCallback, useEffect, useState } from 'react';
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
  BadgeCheck,
  Coins,
  FileBadge,
  HeartHandshake,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Stats {
  total: number;
  registered: number;
  withRegNumber: number;
  totalBeneficiaries: number;
  maleBeneficiaries: number;
  femaleBeneficiaries: number;
  totalVolunteers: number;
  totalBudget: number;
  avgBudget: number;
  types: { charityType: string; count: number; beneficiaries: number }[];
  organizationTypes: { organizationType: string; count: number }[];
  subCities: { subCity: string; count: number; beneficiaries: number }[];
  budgetBuckets: { label: string; count: number }[];
}

const ORG_COLORS = ['#0d9488', '#f59e0b', '#10b981', '#f97316', '#7c3aed', '#0ea5e9'];
const fmt = (n: number) => n.toLocaleString('en');
const chartTooltipStyle = {
  borderRadius: 12,
  border: '1px solid #ccf1ea',
  boxShadow: '0 8px 24px -8px rgba(13,148,136,0.35)',
  fontSize: 12,
};

export default function CharityStats() {
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch('/api/charities/stats')
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
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
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
          <p className="text-sm font-medium text-teal-950">Could not load statistics. Check the connection and try again.</p>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="animate-fade-up mx-auto max-w-4xl space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm">
              <HeartHandshake className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xl font-extrabold leading-tight text-teal-950">{fmt(data.total)}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/50">Charities</p>
            </div>
          </div>
        </div>
        <div className="card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xl font-extrabold leading-tight text-teal-950">{fmt(data.totalBeneficiaries)}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/50">Beneficiaries</p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <Badge variant="secondary" className="bg-teal-50 text-[10px] text-teal-700">M {fmt(data.maleBeneficiaries)}</Badge>
            <Badge variant="secondary" className="bg-amber-50 text-[10px] text-amber-700">F {fmt(data.femaleBeneficiaries)}</Badge>
          </div>
        </div>
        <div className="card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm">
              <Coins className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold leading-tight text-teal-950">{fmt(data.totalBudget)}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/50">Budget (ETB)</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Avg. {fmt(data.avgBudget)} per organization</p>
        </div>
        <div className="card-lift rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-gradient flex h-9 w-9 items-center justify-center rounded-lg text-white shadow-sm">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xl font-extrabold leading-tight text-teal-950">{fmt(data.registered)}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-teal-900/50">Registered</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700"><FileBadge className="h-2.5 w-2.5" />Reg. No. {data.withRegNumber}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700">Volunteers {fmt(data.totalVolunteers)}</span>
          </div>
        </div>
      </div>

      {data.total === 0 ? (
        <Card className="rounded-2xl border-teal-100">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <HeartHandshake className="h-10 w-10 text-teal-300" />
            <p className="font-semibold text-teal-950">No charity data yet</p>
            <p className="text-sm text-muted-foreground">Statistics appear as soon as surveys are collected or imported.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* By charity type */}
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Charity Type</CardTitle>
                <CardDescription>Organizations and beneficiaries per support area</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.types.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="charityType" width={150} tick={{ fontSize: 8, fill: '#134e4a' }} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="count" name="Charities" fill="#f59e0b" radius={[0, 6, 6, 0]} barSize={12} />
                      <Bar dataKey="beneficiaries" name="Beneficiaries" fill="#0d9488" radius={[0, 6, 6, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By organization type */}
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Organization Type</CardTitle>
                <CardDescription>NGO, Iddir, faith-based and other shares</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.organizationTypes} dataKey="count" nameKey="organizationType" innerRadius={50} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                        {data.organizationTypes.map((_, i) => (
                          <Cell key={i} fill={ORG_COLORS[i % ORG_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${v} charities`, 'Count']} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By sub-city */}
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">By Sub-City</CardTitle>
                <CardDescription>Coverage across sub-cities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.subCities} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                      <XAxis dataKey="subCity" tick={{ fontSize: 10, fill: '#134e4a' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="count" name="Charities" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={26} />
                      <Bar dataKey="beneficiaries" name="Beneficiaries" fill="#0d9488" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Budget distribution */}
            <Card className="card-lift rounded-2xl border-teal-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Annual Budget Distribution</CardTitle>
                <CardDescription>Charities grouped by budget (ETB)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.budgetBuckets} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0d948818" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#134e4a' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#134e4a' }} allowDecimals={false} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [`${v} charities`, 'Count']} />
                      <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <p className="pb-2 text-center text-[11px] text-teal-900/45">
            Bussa Goonofa / Charity initiative — Dhibayyuu Sub-City statistics
          </p>
        </>
      )}
    </div>
  );
}
