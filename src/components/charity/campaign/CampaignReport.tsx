'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  FileBarChart2,
  Loader2,
  Printer,
  Download,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Gift,
  Users,
  Target,
  CircleCheck,
  Clock,
} from 'lucide-react';
import {
  campaignStatusStyle,
  money,
  pct,
  OFFICE_STATE_CONFIG,
  type CampaignDTO,
  type CampaignAnalysis,
  type DonationDTO,
} from '@/lib/donation-campaign';

interface CampaignDetail extends CampaignDTO {
  assignments: { id: string; departmentId: string; departmentName: string; minimumAmount: number; note: string | null }[];
  donations: DonationDTO[];
  analysis: CampaignAnalysis;
}

interface CampaignReportProps {
  refreshTrigger: number;
}

const STATE_BAR: Record<string, string> = {
  upcoming: 'bg-slate-400',
  achieved: 'bg-emerald-500',
  onTrack: 'bg-sky-500',
  behind: 'bg-amber-500',
  missed: 'bg-rose-500',
  unassigned: 'bg-violet-500',
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'slate';
}) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-lg font-bold sm:text-xl">{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function CampaignReport({ refreshTrigger }: CampaignReportProps) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [campaignId, setCampaignId] = useState('');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/donation-campaigns');
      const d = res.ok ? await res.json() : { data: [] };
      const list: CampaignDetail[] = Array.isArray(d.data) ? d.data : [];
      setCampaigns(list);
      setCampaignId((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ''));
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  // the office-wise report needs the full detail (donation entries included)
  // which the list endpoint does not carry — fetch the selected campaign.
  useEffect(() => {
    if (!campaignId) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoadingDetail(true);
    fetch(`/api/donation-campaigns/${campaignId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setDetail(d ?? null);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setLoadingDetail(false);
      });
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const campaign = detail;

  const deleteEntry = async (entryId: string) => {
    if (!campaign) return;
    const res = await fetch(`/api/donation-campaigns/${campaign.id}/donations/${entryId}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Could not delete', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
      return;
    }
    toast({ title: 'Entry removed' });
    // refresh both the picker summary and the open report
    await load();
    const fresh = await fetch(`/api/donation-campaigns/${campaign.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (fresh) setDetail(fresh);
  };

  const exportCsv = () => {
    if (!campaign) return;
    window.location.href = `/api/donation-campaigns/export?campaignId=${campaign.id}`;
  };

  if (loading || (campaignId && loadingDetail && !campaign)) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading goal reports…
          </p>
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No campaign yet — set a goal under &ldquo;Set Goal &amp; Distribute&rdquo; and the office-wise report appears here.
        </CardContent>
      </Card>
    );
  }

  const a = campaign?.analysis;
  const st = campaign ? campaignStatusStyle(campaign.status) : null;
  const paceDelta = a?.paceDelta ?? null;
  const behind = paceDelta != null && paceDelta < -10;
  const donationRows = campaign?.donations ?? [];

  return (
    <div className="space-y-3">
      {/* controls + print header */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger className="w-full text-sm sm:w-96">
            <SelectValue placeholder="Select campaign" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.status.toLowerCase()} · {pct(c.analysis.attainmentPct)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!campaign} className="border-emerald-300 text-emerald-800">
            <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!campaign} className="border-emerald-300 text-emerald-800">
            <Printer className="mr-1 h-3.5 w-3.5" /> Print report
          </Button>
        </div>
      </div>

      <p className="hidden print:block">
        <span className="text-lg font-bold">{campaign?.name}</span>
        <span className="block text-xs">
          Office-wise goal report · Bussa Goonofaa Charity · Dhibayyuu Sub-City · printed {new Date().toISOString().slice(0, 10)}
        </span>
      </p>

      {campaign && a && st && (
        <>
          {/* header */}
          <Card className="print:shadow-none">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                <FileBarChart2 className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
                <span>{campaign.name}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${st.badge}`}>{st.label}</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {campaign.startDate.slice(0, 10)} → {campaign.deadline.slice(0, 10)} · {a.daysLeft > 0 ? `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left` : 'window ended'} ·
                {campaign.kindNote ? ` in-kind expected: ${campaign.kindNote}` : ' cash and in-kind donations'}
                {campaign.description ? ` · ${campaign.description}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard icon={Target} label="Campaign Goal" value={money(campaign.totalGoal, campaign.currency)} tone="slate" sub={`${a.assignedOffices} offices`} />
                <StatCard icon={Wallet} label="Cash Collected" value={money(a.cash, campaign.currency)} tone="emerald" sub={`${a.entries} records`} />
                <StatCard icon={Gift} label="In-Kind Value" value={money(a.inKind, campaign.currency)} tone="violet" sub="estimated value" />
                <StatCard
                  icon={a.state === 'achieved' ? CircleCheck : behind ? TrendingDown : TrendingUp}
                  label="Attainment"
                  value={pct(a.attainmentPct)}
                  tone={a.state === 'achieved' ? 'emerald' : behind ? 'rose' : 'sky'}
                  sub={`pace expected ${pct(a.pacePct)}`}
                />
                <StatCard icon={Target} label="Gap to Goal" value={money(a.gap, campaign.currency)} tone={a.gap === 0 ? 'emerald' : 'amber'} sub={`${a.officesAchieved}/${a.assignedOffices} offices at minimum`} />
                <StatCard icon={Users} label="Donors Reached" value={String(a.donors)} tone="slate" sub={`${a.officesReportDue} office${a.officesReportDue === 1 ? '' : 's'} behind on reporting`} />
              </div>

              {/* campaign progress bar with pace marker */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    {money(a.collected, campaign.currency)} of {money(campaign.totalGoal, campaign.currency)} collected
                  </span>
                  <span className={behind ? 'font-semibold text-rose-600' : 'text-muted-foreground'}>
                    {paceDelta != null && (paceDelta >= 0 ? `+${Math.round(paceDelta * 10) / 10}` : Math.round(paceDelta * 10) / 10)} points vs schedule
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${a.state === 'achieved' ? 'bg-emerald-500' : behind ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${a.progressPct}%` }} />
                  {a.pacePct < 100 && campaign.status === 'ACTIVE' && (
                    <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: `${a.pacePct}%` }} title="expected pace" />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {a.unassignedCollected > 0 && `Includes ${money(a.unassignedCollected, campaign.currency)} collected by offices without a distributed minimum. `}
                  {a.state === 'achieved' && 'Campaign goal reached.'}
                  {a.state === 'missed' && 'Deadline passed before the goal was reached.'}
                  {a.state === 'behind' && 'Behind the pace expected by elapsed time.'}
                  {a.state === 'onTrack' && 'On track against the elapsed-time schedule.'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* office-wise goal table */}
          <Card className="print:shadow-none">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Office-wise Goal Report</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Each office&apos;s distributed minimum vs. what it actually collected — the accountability view presented to higher officials.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-semibold">Office</th>
                    <th className="py-2 pr-2 text-right font-semibold">Minimum</th>
                    <th className="py-2 pr-2 text-right font-semibold">Cash</th>
                    <th className="py-2 pr-2 text-right font-semibold">In-Kind</th>
                    <th className="py-2 pr-2 text-right font-semibold">Total</th>
                    <th className="py-2 pr-2 font-semibold">Attainment</th>
                    <th className="py-2 pr-2 text-right font-semibold">Gap</th>
                    <th className="py-2 pr-2 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Last Record</th>
                  </tr>
                </thead>
                <tbody>
                  {a.offices.map((o) => {
                    const stateCfg = OFFICE_STATE_CONFIG[o.state];
                    return (
                      <tr key={o.departmentId} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          <p className="font-medium">{o.departmentName}</p>
                          {o.note && <p className="text-[10px] text-muted-foreground">{o.note}</p>}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{o.assigned ? money(o.minimumAmount, campaign.currency) : '—'}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{money(o.cash, campaign.currency)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{money(o.inKind, campaign.currency)}</td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">{money(o.collected, campaign.currency)}</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full rounded-full ${STATE_BAR[o.state]}`} style={{ width: `${Math.min(100, o.attainmentPct ?? 0)}%` }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums">{pct(o.attainmentPct)}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">{o.assigned && o.gap > 0 ? money(o.gap, campaign.currency) : o.assigned ? '—' : '—'}</td>
                        <td className="py-2 pr-2">
                          <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${stateCfg.badge}`}>{stateCfg.label}</span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {o.lastReportDate ? (
                            <>
                              {o.lastReportDate.slice(0, 10)}
                              {o.daysSinceLastReport != null && o.daysSinceLastReport >= 2 && (
                                <span className="ml-1 font-semibold text-amber-700">({o.daysSinceLastReport}d ago)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-700">no record yet</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* campaign total row */}
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-2">Campaign Total</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(a.offices.filter((o) => o.assigned).reduce((s, o) => s + o.minimumAmount, 0), campaign.currency)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(a.cash, campaign.currency)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(a.inKind, campaign.currency)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(a.collected, campaign.currency)}</td>
                    <td className="py-2 pr-2 text-xs">{pct(a.attainmentPct)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(a.gap, campaign.currency)}</td>
                    <td className="py-2 pr-2 text-xs uppercase">{a.state}</td>
                    <td className="py-2" />
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* recent donation records */}
          <Card className="print:shadow-none">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Achievement Records ({donationRows.length})</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Everything the offices reported — cash received, in-kind contributions and donors reached.</CardDescription>
            </CardHeader>
            <CardContent>
              {donationRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No achievement records yet — offices record theirs under &ldquo;Record Achievement&rdquo;.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {donationRows.slice(0, 12).map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold">{e.departmentName} <span className="font-normal text-muted-foreground">· {e.reportDate.slice(0, 10)}</span></p>
                        <p className="text-muted-foreground">
                          {e.inKindDetails ? `in-kind: ${e.inKindDetails}` : 'cash collection'}
                          {e.notes ? ` · ${e.notes}` : ''}
                          {e.reportedByName ? ` · by ${e.reportedByName}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular-nums">cash <b>{money(e.cashAmount, campaign.currency)}</b></span>
                        <span className="tabular-nums">in-kind <b>{money(e.inKindValue, campaign.currency)}</b></span>
                        <span className="flex items-center gap-1 tabular-nums text-muted-foreground"><Users className="h-3 w-3" />{e.donorsCount}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-rose-500 hover:bg-rose-50 hover:text-rose-600 print:hidden"
                          onClick={() => deleteEntry(e.id)}
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {donationRows.length > 12 && (
                    <p className="pt-1 text-center text-[11px] text-muted-foreground">Showing the 12 most recent of {donationRows.length} records.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
