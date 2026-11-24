'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/components/SettingsProvider';
import { useAuth } from '@/components/AuthProvider';
import {
  Rocket,
  Database,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  Clock,
  TriangleAlert,
  Target,
  FileText,
  CalendarCheck,
  Building2,
  MapPin,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  INITIATIVE_STATUSES,
  PERIOD_LABELS,
  statusStyle,
  pct,
  type TargetAnalysis,
} from '@/lib/initiative-monitor';
import type { AnalyzedInitiative } from '@/lib/initiative-queries';

interface InitiativeListProps {
  refreshTrigger: number;
}

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function TargetRowView({ t }: { t: TargetAnalysis }) {
  const target = t.target;
  return (
    <div className="rounded-lg border bg-white p-2.5 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-xs font-semibold sm:text-sm">
          {target.metric}
          <span className="ml-1 font-normal text-muted-foreground">
            ({target.targetValue} {target.unit ?? ''} · {PERIOD_LABELS[target.periodType] ?? target.periodType}
            {target.dueDate ? ` · due ${target.dueDate.slice(0, 10)}` : ''})
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {t.overdue && (
            <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
              <TriangleAlert className="h-3 w-3" /> overdue
            </Badge>
          )}
          {t.met && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> met
            </Badge>
          )}
        </span>
      </div>
      <Progress value={Math.min(100, t.attainmentPct ?? 0)} className="h-2" />
      <p className="text-[11px] text-muted-foreground sm:text-xs">
        Achieved <span className="font-semibold text-foreground">{t.achieved}</span>
        {' '}of {target.targetValue} {target.unit ?? ''} ·{' '}
        {pct(t.attainmentPct)} · gap <span className="font-semibold text-amber-700">{t.gap}</span>
      </p>
    </div>
  );
}

export default function InitiativeList({ refreshTrigger }: InitiativeListProps) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { subCities } = useSettings();
  const [initiatives, setInitiatives] = useState<AnalyzedInitiative[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subCityFilter, setSubCityFilter] = useState('all');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [detail, setDetail] = useState<AnalyzedInitiative | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnalyzedInitiative | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: '20' });
        if (search.trim()) params.set('search', search.trim());
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (subCityFilter !== 'all') params.set('subCity', subCityFilter);
        if (delayedOnly) params.set('delayed', 'true');
        const res = await fetch(`/api/initiatives?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        setInitiatives(payload.data ?? []);
        setTotal(payload.total ?? 0);
        setPages(payload.totalPages ?? 1);
        setPage(payload.page ?? p);
      } catch {
        toast({ title: 'Failed to load', description: 'Could not reach the server.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, subCityFilter, delayedOnly, toast]
  );

  useEffect(() => {
    load(1);
  }, [refreshTrigger, statusFilter, subCityFilter, delayedOnly]);

  const changeStatus = async (id: string, status: string) => {
    setStatusUpdating(true);
    try {
      const res = await fetch(`/api/initiatives/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not update', description: payload.error || `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({
        title: status === 'FULLY_OPERATIONAL' ? 'Initiative is fully operational' : 'Status updated',
        description: status === 'FULLY_OPERATIONAL' ? 'Completion recorded — congratulations to the responsible department!' : `Moved to ${statusStyle(status).label}.`,
      });
      await load(page);
      if (detail?.id === id) {
        const fresh = await fetch(`/api/initiatives/${id}`).then((r) => (r.ok ? r.json() : null));
        if (fresh) setDetail(fresh);
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/initiatives/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast({ title: 'Could not delete', description: payload.error || `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({ title: 'Deleted', description: `"${deleteTarget.name}" and its reports were removed.` });
      setDetail(null);
      setDeleteTarget(null);
      load(1);
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = () => {
    window.location.href = '/api/initiatives/export';
    toast({ title: 'Export started', description: 'The CSV download includes the live analysis columns.' });
  };

  const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
              <Database className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
              <span className="leading-tight">Kaa&apos;umsota Galmee<br /><span className="text-sm font-normal text-muted-foreground sm:text-base">Initiative records &amp; follow-up</span></span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={exportCsv} className="shrink-0">
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            {total} initiative{total === 1 ? '' : 's'} from establishment to full operation — delays, gaps and reporting compliance are live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, description, location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load(1)}
                className="pl-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
              <SelectTrigger className="w-full text-sm sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INITIATIVE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{statusStyle(s).label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={subCityFilter} onValueChange={(v) => setSubCityFilter(v)}>
              <SelectTrigger className="w-full text-sm sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub-cities</SelectItem>
                {subCities.map((sc) => (
                  <SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={delayedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDelayedOnly((v) => !v)}
              className={delayedOnly ? 'bg-rose-600 font-semibold text-white hover:bg-rose-700' : ''}
            >
              <Clock className="mr-1 h-3.5 w-3.5" /> Delayed
            </Button>
            <Button variant="outline" size="sm" onClick={() => load(page)} title="Refresh">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading initiatives…
            </p>
          ) : initiatives.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Rocket className="h-6 w-6 opacity-40" />
              No initiatives match. Establish one under &ldquo;Establish Initiative&rdquo;.
            </p>
          ) : (
            <div className="space-y-2.5">
              {initiatives.map((i) => {
                const a = i.analysis;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setDetail(i)}
                    className="w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold sm:text-base">{i.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground sm:text-xs">
                          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{i.departmentName}</span>
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{i.subCity}{i.area ? ` · ${i.area}` : ''}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={i.status} />
                        {a.delayed && (
                          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                            <Clock className="h-3 w-3" /> {a.delayDays}d late
                          </Badge>
                        )}
                        {a.reportDueToday && !a.fullyOperational && i.status !== 'CANCELLED' && (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                            <CalendarCheck className="h-3 w-3" /> report due
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-emerald-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attainment</p>
                        <p className="text-sm font-bold text-emerald-800">{pct(a.attainmentPct)}</p>
                      </div>
                      <div className="rounded-lg bg-sky-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Achieved / Target</p>
                        <p className="text-sm font-bold text-sky-800">
                          {Math.round(a.achievedTotal * 10) / 10} / {Math.round(a.totalTarget * 10) / 10}
                        </p>
                      </div>
                      <div className="rounded-lg bg-amber-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Gap</p>
                        <p className="text-sm font-bold text-amber-800">{Math.round(Math.max(0, a.totalTarget - a.achievedTotal) * 10) / 10}</p>
                      </div>
                      <div className="rounded-lg bg-violet-50/60 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Last report</p>
                        <p className="text-sm font-bold text-violet-800">{fmtDate(a.lastReportDate)}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => load(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" onClick={() => load(page + 1)} disabled={page >= pages}>
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-base sm:text-lg">
                  <span className="min-w-0 flex-1 truncate">{detail.name}</span>
                  <StatusBadge status={detail.status} />
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {detail.category} · {detail.departmentName} · {detail.subCity}{detail.area ? ` · ${detail.area}` : ''}
                  {detail.analysis.delayed && (
                    <span className="ml-1 inline-flex items-center gap-1 font-semibold text-rose-600">
                      <Clock className="h-3 w-3" /> {detail.analysis.delayDays} days past the expected fully-operational date
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Lifecycle progress */}
              <div className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Follow-up lifecycle</span>
                  <span className="text-muted-foreground">
                    est. {fmtDate(detail.establishmentDate)} → expected {fmtDate(detail.expectedOperationalDate)}
                    {detail.analysis.timelinePct != null && ` · ${Math.round(detail.analysis.timelinePct)}% of the window elapsed`}
                  </span>
                </div>
                <Progress value={detail.analysis.timelinePct ?? 0} className="mt-2 h-2.5" />
                {detail.operationalDate && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Fully operational on {fmtDate(detail.operationalDate)}
                  </p>
                )}
              </div>

              <Tabs defaultValue="targets" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="targets" className="text-xs sm:text-sm"><Target className="mr-1 h-3.5 w-3.5" /> Targets</TabsTrigger>
                  <TabsTrigger value="reports" className="text-xs sm:text-sm"><FileText className="mr-1 h-3.5 w-3.5" /> Daily Reports</TabsTrigger>
                  <TabsTrigger value="info" className="text-xs sm:text-sm"><Eye className="mr-1 h-3.5 w-3.5" /> Details</TabsTrigger>
                </TabsList>

                <TabsContent value="targets" className="mt-3 space-y-2.5">
                  {detail.analysis.targets.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No active targets set on this initiative yet.</p>
                  ) : (
                    detail.analysis.targets.map((t) => <TargetRowView key={t.target.id} t={t} />)
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <div className="rounded-lg bg-emerald-50/60 px-2.5 py-2 text-center">
                      <p className="text-[10px] uppercase text-muted-foreground">Attainment</p>
                      <p className="text-sm font-bold text-emerald-800">{pct(detail.analysis.attainmentPct)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50/60 px-2.5 py-2 text-center">
                      <p className="text-[10px] uppercase text-muted-foreground">Gap</p>
                      <p className="text-sm font-bold text-amber-800">
                        {Math.round(Math.max(0, detail.analysis.totalTarget - detail.analysis.achievedTotal) * 10) / 10}
                      </p>
                    </div>
                    <div className="rounded-lg bg-sky-50/60 px-2.5 py-2 text-center">
                      <p className="text-[10px] uppercase text-muted-foreground">Met</p>
                      <p className="text-sm font-bold text-sky-800">{detail.analysis.metTargets}/{detail.analysis.activeTargets}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="reports" className="mt-3">
                  {detail.reports.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No daily reports yet — the department submits them under &ldquo;Daily Report&rdquo;.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                      {[...detail.reports]
                        .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))
                        .map((r) => {
                          const t = detail.targets.find((x) => x.id === r.targetId);
                          return (
                            <div key={r.id} className="rounded-lg border bg-white p-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="text-xs font-bold sm:text-sm">{r.reportDate.slice(0, 10)}</span>
                                {r.achievedValue != null && (
                                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    +{r.achievedValue} {t?.unit ?? ''} {t ? `· ${t.metric}` : ''}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-foreground/80 sm:text-sm">{r.activities}</p>
                              {(r.challenges || r.supportNeeded) && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {r.challenges && <span className="text-amber-700">Challenges: {r.challenges} </span>}
                                  {r.supportNeeded && <span className="text-sky-700">Support needed: {r.supportNeeded}</span>}
                                </p>
                              )}
                              <p className="mt-1 text-[10px] text-muted-foreground">By {r.reportedByName ?? '—'}</p>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="info" className="mt-3 space-y-2 text-xs sm:text-sm">
                  {detail.description && <p className="rounded-lg border bg-white p-2.5">{detail.description}</p>}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Location:</span> {detail.location ?? '—'}</p>
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Contact:</span> {detail.contactName ?? '—'} {detail.contactPhone ?? ''}</p>
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Established:</span> {fmtDate(detail.establishmentDate)}</p>
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Expected operational:</span> {fmtDate(detail.expectedOperationalDate)}</p>
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Registered by:</span> {detail.surveyorName ?? '—'}</p>
                    <p className="rounded-lg border bg-white p-2.5"><span className="text-muted-foreground">Reports last 7 days:</span> {detail.analysis.reportsLast7Days}</p>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Admin controls */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Label className="shrink-0 text-xs">Move status:</Label>
                    <Select
                      value={detail.status}
                      onValueChange={(v) => changeStatus(detail.id, v)}
                      disabled={statusUpdating}
                    >
                      <SelectTrigger className="h-8 w-full max-w-52 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INITIATIVE_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{statusStyle(s).label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {statusUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(detail)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete initiative?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} and all its targets and daily reports will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
