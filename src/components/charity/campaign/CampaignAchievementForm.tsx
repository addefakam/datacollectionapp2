'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  HandCoins,
  Loader2,
  Search,
  Send,
  Wallet,
  Gift,
  Users,
  StickyNote,
  CircleCheck,
  CircleAlert,
  Clock,
  Trash2,
  Info,
} from 'lucide-react';
import { money, pct, type CampaignDTO, type CampaignAnalysis, type OfficeAnalysis } from '@/lib/donation-campaign';

interface CampaignRow extends CampaignDTO {
  assignments: { id: string; departmentId: string; departmentName: string; minimumAmount: number; note: string | null }[];
  analysis: CampaignAnalysis;
}

interface EntryRow {
  id: string;
  departmentId: string;
  departmentName: string;
  reportDate: string;
  cashAmount: number;
  inKindValue: number;
  inKindDetails: string | null;
  donorsCount: number;
  notes: string | null;
  reportedByName: string | null;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface CampaignAchievementFormProps {
  onSubmit: () => void;
  userName: string;
  isAdmin: boolean;
}

/** Local YYYY-MM-DD for a date input (Africa/Addis_Ababa ≈ UTC+3). */
function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

export default function CampaignAchievementForm({ onSubmit, userName, isAdmin }: CampaignAchievementFormProps) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [reportDate, setReportDate] = useState(localToday());
  const [cashAmount, setCashAmount] = useState('');
  const [inKindValue, setInKindValue] = useState('');
  const [inKindDetails, setInKindDetails] = useState('');
  const [donorsCount, setDonorsCount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [entries, setEntries] = useState<EntryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // departments feed the office fallback — a campaign without a
      // distribution must still let every office record what it received
      const [c, d] = await Promise.all([
        fetch('/api/donation-campaigns').then((r) => (r.ok ? r.json() : { data: [] })),
        fetch('/api/departments').then((r) => (r.ok ? r.json() : [])),
      ]);
      const list: CampaignRow[] = Array.isArray(c.data) ? c.data : [];
      setCampaigns(list);
      setDepartments(
        Array.isArray(d)
          ? d.filter((x: DepartmentOption | null) => x && x.id && x.name).map((x: DepartmentOption) => ({ id: x.id, name: x.name }))
          : []
      );
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const campaign = useMemo(() => campaigns.find((c) => c.id === campaignId) ?? null, [campaigns, campaignId]);

  const office = useMemo<OfficeAnalysis | null>(
    () => campaign?.analysis.offices.find((o) => o.departmentId === officeId) ?? null,
    [campaign, officeId]
  );

  // office picker groups: assigned offices keep their distributed minimum;
  // every other registered office is still selectable ("no minimum set") so
  // recording NEVER gets stuck — even for a campaign without a distribution
  const officeGroups = useMemo(() => {
    if (!campaign) return null;
    const assignedIds = new Set(campaign.assignments.map((a) => a.departmentId));
    const others = departments.filter((d) => !assignedIds.has(d.id));
    return { assignments: campaign.assignments, others };
  }, [campaign, departments]);

  // entries of the selected office within the selected campaign
  const loadEntries = useCallback(async (cid: string, deptId: string) => {
    try {
      const res = await fetch(`/api/donation-campaigns/${cid}/donations?departmentId=${deptId}`);
      if (!res.ok) return setEntries([]);
      const d = await res.json();
      setEntries(Array.isArray(d.data) ? d.data : []);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (campaignId && officeId) loadEntries(campaignId, officeId);
    else setEntries([]);
  }, [campaignId, officeId, loadEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const alreadyToday = entries.some((e) => e.reportDate.slice(0, 10) === reportDate);

  const resetForm = () => {
    setReportDate(localToday());
    setCashAmount('');
    setInKindValue('');
    setInKindDetails('');
    setDonorsCount('');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!campaign) {
      toast({ title: 'Select a campaign', variant: 'destructive' });
      return;
    }
    if (campaign.status !== 'ACTIVE') {
      toast({ title: 'Campaign is not active', description: 'Achievements can only be recorded while the campaign is ACTIVE.', variant: 'destructive' });
      return;
    }
    if (!officeId) {
      toast({ title: 'Select the office', description: 'Choose the office that received the donations', variant: 'destructive' });
      return;
    }
    const cash = cashAmount === '' ? 0 : Number(cashAmount);
    const inKind = inKindValue === '' ? 0 : Number(inKindValue);
    if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(inKind) || inKind < 0) {
      toast({ title: 'Amounts must be 0 or more', variant: 'destructive' });
      return;
    }
    if (cash === 0 && inKind === 0) {
      toast({
        title: 'Nothing recorded',
        description: 'Enter the cash collected, the estimated value of in-kind donations, or both.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/donation-campaigns/${campaign.id}/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: officeId,
          reportDate,
          cashAmount: cash,
          inKindValue: inKind,
          inKindDetails: inKindDetails.trim() || null,
          donorsCount: donorsCount === '' ? 0 : Number(donorsCount),
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not record', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Achievement recorded',
        description: `${office?.departmentName ?? 'The office'} collected ${money(cash + inKind, campaign.currency)} on ${reportDate}. The office report updates automatically.`,
      });
      resetForm();
      const [fresh, freshEntries] = await Promise.all([
        fetch('/api/donation-campaigns').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        loadEntries(campaign.id, officeId),
      ]);
      if (fresh?.data) setCampaigns(fresh.data);
      onSubmit();
      void freshEntries;
    } catch {
      toast({ title: 'Network error', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async (entryId: string) => {
    if (!campaign) return;
    const res = await fetch(`/api/donation-campaigns/${campaign.id}/donations/${entryId}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Could not delete', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
      return;
    }
    toast({ title: 'Entry removed' });
    await loadEntries(campaign.id, officeId);
    const fresh = await fetch('/api/donation-campaigns').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (fresh?.data) setCampaigns(fresh.data);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
            <HandCoins className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
            <span className="leading-tight">
              Galii Qofjii Gabbaasa<br />
              <span className="text-sm font-normal text-muted-foreground sm:text-base">Record office achievement — donations received</span>
            </span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Each office records the donations it received for the campaign: cash collected plus in-kind contributions and their estimated value. The coordination office follows every entry in the office-wise goal report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          {/* campaign picker */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">Campaign <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search campaigns…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border bg-white p-1.5">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  No campaigns yet — the coordination office sets one under &ldquo;Set Goal &amp; Distribute&rdquo;.
                </p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCampaignId(c.id); setOfficeId(''); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                      campaignId === c.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-emerald-900/[0.04]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        Goal {money(c.totalGoal, c.currency)} · {c.analysis.assignedOffices} offices · {pct(c.analysis.attainmentPct)} collected
                      </span>
                    </span>
                    {c.status === 'ACTIVE' ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <CircleCheck className="h-3 w-3" /> active
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        <Clock className="h-3 w-3" /> {c.status.toLowerCase()}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {campaign && (
            <>
              {/* office picker: distribution first, every other office as fallback */}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Office that received the donations <span className="text-red-500">*</span></Label>
                {campaign.assignments.length === 0 && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 sm:text-xs">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      This campaign has no office distribution yet — the coordination office can set minimums under &ldquo;Set Goal &amp; Distribute&rdquo;.
                      You can still record which office received the donations; its entries count toward the campaign total as &ldquo;no minimum set&rdquo;.
                    </span>
                  </p>
                )}
                <Select value={officeId} onValueChange={setOfficeId}>
                  <SelectTrigger className="text-sm sm:text-base">
                    <SelectValue placeholder="Select office" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {officeGroups && officeGroups.assignments.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Assigned offices — minimum to collect
                        </SelectLabel>
                        {officeGroups.assignments.map((a) => (
                          <SelectItem key={a.departmentId} value={a.departmentId}>
                            {a.departmentName} — minimum {money(a.minimumAmount, campaign.currency)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {officeGroups && officeGroups.others.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {officeGroups.assignments.length > 0 ? 'Other offices — no minimum set' : 'Offices'}
                        </SelectLabel>
                        {officeGroups.others.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name} — no minimum set
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {officeGroups && officeGroups.assignments.length === 0 && officeGroups.others.length === 0 && (
                      <SelectLabel className="text-xs font-normal text-muted-foreground">
                        No offices registered yet — ask the admin to add offices under Settings
                      </SelectLabel>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {office && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs sm:text-sm">
                  <p className="font-semibold text-emerald-900">
                    {office.departmentName}
                    {!office.assigned && (
                      <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-violet-700">
                        no minimum set
                      </span>
                    )}
                  </p>
                  {office.assigned ? (
                    <>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, office.attainmentPct ?? 0)}%` }} />
                        </div>
                        <span className="font-bold text-emerald-800">{pct(office.attainmentPct)}</span>
                      </div>
                      <p className="mt-1 text-emerald-800/70">
                        {money(office.collected, campaign.currency)} collected of {money(office.minimumAmount, campaign.currency)} minimum
                        {' · '}{money(office.gap, campaign.currency)} remaining
                        {' · '}last record: {office.lastReportDate ? office.lastReportDate.slice(0, 10) : 'none'}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-emerald-800/70">
                      {money(office.collected, campaign.currency)} collected so far — this office has no distributed minimum; its entries count toward the campaign total
                      {' · '}last record: {office.lastReportDate ? office.lastReportDate.slice(0, 10) : 'none'}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="da-date" className="text-xs sm:text-sm">Date <span className="text-red-500">*</span></Label>
                  <Input id="da-date" type="date" max={localToday()} value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="text-sm sm:text-base" />
                  {alreadyToday && (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-sky-700">
                      <Info className="h-3 w-3" /> An entry already exists for this day — this will be added as another record.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="da-donors" className="text-xs sm:text-sm inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-emerald-600" /> Donors Reached
                  </Label>
                  <Input id="da-donors" type="number" min="0" step="1" placeholder="e.g., 25" value={donorsCount} onChange={(e) => setDonorsCount(e.target.value)} className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="da-cash" className="text-xs sm:text-sm inline-flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5 text-emerald-600" /> Cash Collected (ETB)
                  </Label>
                  <Input id="da-cash" type="number" min="0" step="any" placeholder="e.g., 12500" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="da-kind" className="text-xs sm:text-sm inline-flex items-center gap-1">
                    <Gift className="h-3.5 w-3.5 text-emerald-600" /> In-Kind Value (ETB)
                  </Label>
                  <Input id="da-kind" type="number" min="0" step="any" placeholder="estimated value, e.g., 8000" value={inKindValue} onChange={(e) => setInKindValue(e.target.value)} className="text-sm sm:text-base" />
                </div>
                <div className="space-y-1.5 sm:col-span-2 sm:space-y-2">
                  <Label htmlFor="da-kind-details" className="text-xs sm:text-sm">
                    In-Kind Details <span className="text-[11px] font-normal text-muted-foreground">— what was donated</span>
                  </Label>
                  <Input
                    id="da-kind-details"
                    placeholder='e.g., "15 quintals teff, 20 blankets, 3 cattle"'
                    value={inKindDetails}
                    onChange={(e) => setInKindDetails(e.target.value)}
                    className="text-sm sm:text-base"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 sm:space-y-2">
                  <Label htmlFor="da-notes" className="text-xs sm:text-sm inline-flex items-center gap-1">
                    <StickyNote className="h-3.5 w-3.5 text-amber-600" /> Notes
                  </Label>
                  <Textarea id="da-notes" rows={2} placeholder="How the collection went, challenges, plans for tomorrow…" value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
                </div>
              </div>

              {/* this office's recent entries */}
              {entries.length > 0 && (
                <div className="rounded-xl border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {office?.departmentName}&apos;s records in this campaign ({entries.length})
                  </p>
                  <div className="space-y-1.5">
                    {entries.slice(0, 5).map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs">
                        <span className="font-medium">{e.reportDate.slice(0, 10)}</span>
                        <span className="text-muted-foreground">
                          cash <span className="font-semibold text-foreground">{money(e.cashAmount)}</span>
                          {' · '}in-kind <span className="font-semibold text-foreground">{money(e.inKindValue)}</span>
                          {e.inKindDetails && <span className="block text-[10px] italic">{e.inKindDetails}</span>}
                        </span>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => deleteEntry(e.id)} aria-label="Delete entry">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {campaign.status !== 'ACTIVE' && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 sm:text-xs">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This campaign is {campaign.status.toLowerCase()} — new achievement records are closed.
                    The coordination office can reopen it under &ldquo;Set Goal &amp; Distribute&rdquo;.
                  </span>
                </p>
              )}

              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Send className="h-3.5 w-3.5" /> Recorded by <span className="font-semibold">{userName || 'you'}</span>
                </p>
                <Button type="button" onClick={handleSubmit} disabled={submitting || campaign.status !== 'ACTIVE'} className="bg-brand-gradient min-w-36 font-semibold">
                  {submitting ? (
                    <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Recording…</>
                  ) : (
                    <><HandCoins className="mr-1.5 h-4 w-4" /> Record Achievement</>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
