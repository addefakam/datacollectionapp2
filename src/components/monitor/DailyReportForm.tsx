'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  CalendarCheck,
  Loader2,
  Search,
  ClipboardList,
  TriangleAlert,
  LifeBuoy,
  Send,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PERIOD_LABELS, todayUtc } from '@/lib/initiative-monitor';

interface DailyReportFormProps {
  onSubmit: () => void;
  userName: string;
}

interface InitiativeOption {
  id: string;
  name: string;
  departmentName: string;
  subCity: string;
  status: string;
  targets: { id: string; metric: string; unit: string | null; targetValue: number; periodType: string }[];
  analysis: { lastReportDate: string | null; daysSinceLastReport: number | null; reportDueToday: boolean };
}

/** Local YYYY-MM-DD for a date input (Africa/Addis_Ababa ≈ UTC+3). */
function localToday(): string {
  const now = new Date();
  const addis = new Date(now.getTime() + 3 * 3600000);
  return addis.toISOString().slice(0, 10);
}

export default function DailyReportForm({ onSubmit, userName }: DailyReportFormProps) {
  const { toast } = useToast();
  const [initiatives, setInitiatives] = useState<InitiativeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reportDate, setReportDate] = useState(localToday());
  const [activities, setActivities] = useState('');
  const [achievedValue, setAchievedValue] = useState('');
  const [targetId, setTargetId] = useState('');
  const [challenges, setChallenges] = useState('');
  const [supportNeeded, setSupportNeeded] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyReported, setAlreadyReported] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/initiatives?limit=200')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setInitiatives(Array.isArray(d.data) ? d.data : []))
      .catch(() => setInitiatives([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => initiatives.find((i) => i.id === selectedId) ?? null,
    [initiatives, selectedId]
  );

  // has the department already reported for the chosen date? (re-submit updates it)
  useEffect(() => {
    if (!selected || !reportDate) { setAlreadyReported(false); return; }
    setAlreadyReported(selected.analysis.lastReportDate?.slice(0, 10) === reportDate);
  }, [selected, reportDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initiatives;
    return initiatives.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.departmentName.toLowerCase().includes(q) ||
        i.subCity.toLowerCase().includes(q)
    );
  }, [initiatives, search]);

  const selectedTarget = selected?.targets.find((t) => t.id === targetId) ?? null;

  const resetForm = () => {
    setActivities('');
    setAchievedValue('');
    setTargetId('');
    setChallenges('');
    setSupportNeeded('');
    setReportDate(localToday());
  };

  const handleSubmit = async () => {
    if (!selected) {
      toast({ title: 'Select an initiative', description: 'Choose the initiative this report belongs to', variant: 'destructive' });
      return;
    }
    if (!activities.trim()) {
      toast({ title: 'Daily activities required', description: 'Describe what was done today / Wixinee har\'aa barreeffama barbaachisa', variant: 'destructive' });
      return;
    }
    if (achievedValue && selectedTarget == null && selected.targets.length > 0) {
      toast({ title: 'Pick a target', description: 'Choose which target the achieved value counts toward', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/initiatives/${selected.id}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportDate,
          activities: activities.trim(),
          achievedValue: achievedValue === '' ? null : Number(achievedValue),
          targetId: targetId || null,
          challenges: challenges.trim() || null,
          supportNeeded: supportNeeded.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not submit', description: payload.error || `Server responded ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({
        title: alreadyReported ? 'Daily report updated' : 'Daily report submitted',
        description: alreadyReported
          ? `The report for ${reportDate} was replaced with this version.`
          : `Recorded for ${reportDate}. The dashboard updates automatically.`,
      });
      resetForm();
      // refresh initiative list so compliance flags update immediately
      const fresh = await fetch('/api/initiatives?limit=200').then((r) => (r.ok ? r.json() : { data: [] })).catch(() => null);
      if (fresh?.data) setInitiatives(fresh.data);
      onSubmit();
    } catch {
      toast({ title: 'Network error', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
            <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
            <span className="leading-tight">Gabaasa Guyyooti<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Department daily achievement report</span></span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Departments submit what was achieved today. One report per initiative per day — re-submitting a day updates it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          {/* Initiative picker */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">Initiative <span className="text-red-500">*</span></Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by initiative, department or sub-city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border bg-white p-1.5">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading initiatives…
                </p>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No initiatives yet — establish one first under &ldquo;Establish Initiative&rdquo;.
                </p>
              ) : (
                filtered.map((i) => {
                  const overdue = i.analysis.reportDueToday;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => { setSelectedId(i.id); setTargetId(''); }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selectedId === i.id ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-emerald-900/[0.04]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{i.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {i.departmentName} · {i.subCity}
                        </span>
                      </span>
                      {overdue ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                          <Clock className="h-3 w-3" /> report due
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> reported
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selected && (
            <>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs sm:text-sm">
                <p className="font-semibold text-emerald-900">{selected.name}</p>
                <p className="text-emerald-800/70">
                  {selected.targets.length} active target{selected.targets.length === 1 ? '' : 's'} · last report:{' '}
                  {selected.analysis.lastReportDate ? selected.analysis.lastReportDate.slice(0, 10) : 'never'}
                  {selected.analysis.daysSinceLastReport != null && ` (${selected.analysis.daysSinceLastReport}d ago)`}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="dr-date" className="text-xs sm:text-sm">Report Date <span className="text-red-500">*</span></Label>
                  <Input id="dr-date" type="date" max={localToday()} value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="text-sm sm:text-base" />
                  {alreadyReported && (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                      <TriangleAlert className="h-3 w-3" /> A report exists for this day — submitting will update it.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">Counts Toward Target</Label>
                  <Select value={targetId} onValueChange={setTargetId} disabled={selected.targets.length === 0}>
                    <SelectTrigger className="text-sm sm:text-base">
                      <SelectValue placeholder={selected.targets.length ? 'Select target' : 'No targets set'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {selected.targets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.metric} ({t.targetValue} {t.unit ?? ''} · {PERIOD_LABELS[t.periodType] ?? t.periodType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="dr-activities" className="text-xs sm:text-sm">
                  Daily Activities <span className="text-red-500">*</span>{' '}
                  <span className="text-[11px] font-normal text-muted-foreground">— what was done today</span>
                </Label>
                <Textarea id="dr-activities" rows={3} placeholder="e.g., Graded 300 m of the access road; installed 2 water taps at the market site…" value={activities} onChange={(e) => setActivities(e.target.value)} className="text-sm sm:text-base" />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="dr-achieved" className="text-xs sm:text-sm">
                  Achieved Today <span className="text-[11px] font-normal text-muted-foreground">— quantity against the target</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input id="dr-achieved" type="number" min="0" step="any" placeholder={selectedTarget ? `e.g., 0.5 ${selectedTarget.unit ?? ''}` : 'e.g., 3'} value={achievedValue} onChange={(e) => setAchievedValue(e.target.value)} className="text-sm sm:text-base" />
                  {selectedTarget && (
                    <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-800">
                      {selectedTarget.metric}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="dr-challenges" className="text-xs sm:text-sm inline-flex items-center gap-1"><TriangleAlert className="h-3.5 w-3.5 text-amber-600" /> Challenges</Label>
                  <Textarea id="dr-challenges" rows={2} placeholder="What is blocking progress?" value={challenges} onChange={(e) => setChallenges(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="dr-support" className="text-xs sm:text-sm inline-flex items-center gap-1"><LifeBuoy className="h-3.5 w-3.5 text-sky-600" /> Support Needed</Label>
                  <Textarea id="dr-support" rows={2} placeholder="What the sub-city should provide" value={supportNeeded} onChange={(e) => setSupportNeeded(e.target.value)} className="text-sm" />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" /> Reported by <span className="font-semibold">{userName || 'you'}</span>
            </p>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !selected} className="bg-brand-gradient min-w-36 font-semibold">
              {isSubmitting ? (<><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Submitting…</>) : (<><Send className="mr-1.5 h-4 w-4" /> Submit Report</>)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
