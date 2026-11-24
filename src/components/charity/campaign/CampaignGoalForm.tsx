'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Target,
  Loader2,
  Plus,
  Trash2,
  Split,
  Send,
  Pencil,
  CircleCheck,
  Ban,
  RotateCcw,
  HeartHandshake,
  TriangleAlert,
} from 'lucide-react';
import {
  campaignStatusStyle,
  money,
  pct,
  type CampaignDTO,
  type CampaignAnalysis,
} from '@/lib/donation-campaign';

interface CampaignRow extends CampaignDTO {
  assignments: { id: string; departmentId: string; departmentName: string; minimumAmount: number; note: string | null }[];
  analysis: CampaignAnalysis;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface DistributionRow {
  departmentId: string;
  minimumAmount: string;
  note: string;
}

interface CampaignGoalFormProps {
  refreshTrigger: number;
}

/** Local YYYY-MM-DD for a date input (Africa/Addis_Ababa ≈ UTC+3). */
function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

const emptyForm = {
  name: '',
  description: '',
  totalGoal: '',
  kindNote: '',
  startDate: localToday(),
  deadline: '',
};

export default function CampaignGoalForm({ refreshTrigger }: CampaignGoalFormProps) {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);

  // create / edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState<DistributionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<CampaignRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        fetch('/api/donation-campaigns').then((r) => (r.ok ? r.json() : { data: [] })),
        fetch('/api/departments').then((r) => (r.ok ? r.json() : [])),
      ]);
      setCampaigns(Array.isArray(c.data) ? c.data : []);
      setDepartments(Array.isArray(d) ? d : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const goalNumber = useMemo(() => Number(form.totalGoal) || 0, [form.totalGoal]);
  const distributed = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.minimumAmount) || 0), 0),
    [rows]
  );
  const overDistributed = goalNumber > 0 && distributed > goalNumber;
  const remaining = goalNumber - distributed;

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setRows([]);
  };

  const startEdit = (c: CampaignRow) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? '',
      totalGoal: String(c.totalGoal),
      kindNote: c.kindNote ?? '',
      startDate: c.startDate.slice(0, 10),
      deadline: c.deadline.slice(0, 10),
    });
    setRows(
      c.assignments.map((a) => ({
        departmentId: a.departmentId,
        minimumAmount: String(a.minimumAmount),
        note: a.note ?? '',
      }))
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addRow = () => {
    const used = new Set(rows.map((r) => r.departmentId));
    const free = departments.find((d) => !used.has(d.id));
    if (!free) {
      toast({ title: 'All offices are already assigned', variant: 'destructive' });
      return;
    }
    setRows((prev) => [...prev, { departmentId: free.id, minimumAmount: '', note: '' }]);
  };

  /** Divide the campaign goal equally across the offices chosen so far. */
  const autoSplit = () => {
    if (goalNumber <= 0 || rows.length === 0) {
      toast({
        title: 'Enter the goal first',
        description: 'Set the campaign goal amount, then add the offices to distribute it to.',
        variant: 'destructive',
      });
      return;
    }
    const share = Math.floor((goalNumber / rows.length) * 100) / 100;
    const rounded = rows.map((r) => ({ ...r, minimumAmount: String(share) }));
    // put the rounding remainder on the last row
    const diff = Math.round((goalNumber - share * rows.length) * 100) / 100;
    rounded[rounded.length - 1].minimumAmount = String(share + diff);
    setRows(rounded);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Campaign name required', variant: 'destructive' });
      return;
    }
    if (!(goalNumber > 0)) {
      toast({ title: 'Set the campaign goal', description: 'The total minimum amount to collect', variant: 'destructive' });
      return;
    }
    if (!form.startDate || !form.deadline) {
      toast({ title: 'Start date and deadline are required', variant: 'destructive' });
      return;
    }
    if (form.deadline < form.startDate) {
      toast({ title: 'Deadline must be on or after the start date', variant: 'destructive' });
      return;
    }
    if (rows.length === 0) {
      toast({ title: 'Distribute the goal', description: 'Assign at least one office with its minimum amount', variant: 'destructive' });
      return;
    }
    if (rows.some((r) => !(Number(r.minimumAmount) > 0))) {
      toast({ title: 'Every office needs a minimum amount greater than 0', variant: 'destructive' });
      return;
    }
    if (overDistributed) {
      toast({
        title: 'Distribution exceeds the goal',
        description: `Offices are assigned ${money(distributed)} but the goal is ${money(goalNumber)}.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        totalGoal: goalNumber,
        kindNote: form.kindNote.trim() || null,
        startDate: form.startDate,
        deadline: form.deadline,
        assignments: rows.map((r) => ({
          departmentId: r.departmentId,
          minimumAmount: Number(r.minimumAmount),
          note: r.note.trim() || null,
        })),
      };
      const res = editingId
        ? await fetch(`/api/donation-campaigns/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/donation-campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not save', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
        return;
      }
      toast({
        title: editingId ? 'Campaign updated' : 'Campaign goal distributed',
        description: editingId
          ? `"${form.name.trim()}" and its office distribution were updated.`
          : `"${form.name.trim()}" is live — ${rows.length} office${rows.length === 1 ? '' : 's'} received their minimum amounts. Offices can now record achievements.`,
      });
      resetForm();
      await load();
    } catch {
      toast({ title: 'Network error', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (c: CampaignRow, status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED') => {
    const res = await fetch(`/api/donation-campaigns/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Could not update', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
      return;
    }
    toast({ title: `Campaign marked ${status.toLowerCase()}`, description: c.name });
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/donation-campaigns/${deleteId.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Could not delete', description: body.error || `Server responded ${res.status}`, variant: 'destructive' });
      return;
    }
    toast({ title: 'Campaign deleted', description: `${deleteId.name} and its records were removed.` });
    setDeleteId(null);
    if (editingId === deleteId.id) resetForm();
    load();
  };

  const unassignedOffices = departments.filter(
    (d) => !rows.some((r) => r.departmentId === d.id)
  );

  return (
    <div className="space-y-3">
      {/* ---------- create / edit ---------- */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-1.5 text-base sm:gap-2 sm:text-lg">
            <Target className="h-4 w-4 shrink-0 text-emerald-600 sm:h-5 sm:w-5" />
            <span className="leading-tight">
              Kaawachoo Qofjii Afjaqabduu<br />
              <span className="text-sm font-normal text-muted-foreground sm:text-base">Set donation goal &amp; distribute to offices</span>
            </span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            The Bussa Goonofaa office sets one campaign goal (cash + in-kind), then assigns each responsible office — tourism, land management, … — the minimum amount it must collect. Offices record their achievements; the office-wise report shows goal vs. collected live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          {editingId && (
            <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <span className="font-semibold">Editing existing campaign — saving updates the goal and the office distribution.</span>
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="h-7 text-sky-700">
                Cancel edit
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="space-y-1.5 sm:col-span-2 sm:space-y-2">
              <Label htmlFor="cg-name" className="text-xs sm:text-sm">Campaign Name <span className="text-red-500">*</span></Label>
              <Input
                id="cg-name"
                placeholder='e.g., "Bussa Goonofaa Charity Campaign — 2026"'
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="text-sm sm:text-base"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cg-goal" className="text-xs sm:text-sm">
                Total Goal <span className="text-red-500">*</span>{' '}
                <span className="text-[11px] font-normal text-muted-foreground">— minimum amount to collect (cash + in-kind value)</span>
              </Label>
              <Input
                id="cg-goal"
                type="number"
                min="1"
                step="any"
                placeholder="e.g., 500000"
                value={form.totalGoal}
                onChange={(e) => setForm({ ...form, totalGoal: e.target.value })}
                className="text-sm sm:text-base"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cg-kind" className="text-xs sm:text-sm">
                In-Kind Donations Expected
              </Label>
              <Input
                id="cg-kind"
                placeholder="e.g., food grains, clothes, construction materials"
                value={form.kindNote}
                onChange={(e) => setForm({ ...form, kindNote: e.target.value })}
                className="text-sm sm:text-base"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cg-start" className="text-xs sm:text-sm">Start Date <span className="text-red-500">*</span></Label>
              <Input id="cg-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="text-sm sm:text-base" />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cg-deadline" className="text-xs sm:text-sm">Deadline <span className="text-red-500">*</span></Label>
              <Input id="cg-deadline" type="date" min={form.startDate} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="text-sm sm:text-base" />
            </div>
            <div className="space-y-1.5 sm:col-span-2 sm:space-y-2">
              <Label htmlFor="cg-desc" className="text-xs sm:text-sm">Description</Label>
              <Textarea
                id="cg-desc"
                rows={2}
                placeholder="Purpose of the campaign, who it supports, how donations are accepted…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="text-sm sm:text-base"
              />
            </div>
          </div>

          {/* ---------- distribution builder ---------- */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <Split className="h-4 w-4" /> Distribute to offices
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={autoSplit} className="h-8 border-emerald-300 text-emerald-800">
                  <Split className="mr-1 h-3.5 w-3.5" /> Split equally
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addRow} className="h-8 border-emerald-300 text-emerald-800">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add office
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No office assigned yet — add the offices that will collect donations and their minimum amounts.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, idx) => (
                  <div key={idx} className="grid grid-cols-1 items-end gap-2 rounded-lg border bg-white p-2 sm:grid-cols-[1fr_140px_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Office</Label>
                      <Select
                        value={r.departmentId}
                        onValueChange={(v) =>
                          setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, departmentId: v } : row)))
                        }
                      >
                        <SelectTrigger className="text-sm"><SelectValue placeholder="Select office" /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {departments
                            .filter((d) => d.id === r.departmentId || !rows.some((x, i) => i !== idx && x.departmentId === d.id))
                            .map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Minimum (ETB)</Label>
                      <Input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="e.g., 50000"
                        value={r.minimumAmount}
                        onChange={(e) =>
                          setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, minimumAmount: e.target.value } : row)))
                        }
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Note (optional)</Label>
                      <Input
                        placeholder="e.g., focus on business community donors"
                        value={r.note}
                        onChange={(e) =>
                          setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, note: e.target.value } : row)))
                        }
                        className="text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mb-0.5 h-8 w-8 shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove office"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {goalNumber > 0 && rows.length > 0 && (
              <div
                className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  overDistributed
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : remaining === 0
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {overDistributed && <TriangleAlert className="h-3.5 w-3.5" />}
                  Distributed: {money(distributed)} of {money(goalNumber)}
                </span>
                <span>
                  {overDistributed
                    ? `Exceeds the goal by ${money(distributed - goalNumber)}`
                    : remaining === 0
                      ? 'Goal fully distributed'
                      : `${money(remaining)} not yet assigned (kept by the coordination office)`}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button type="button" onClick={handleSubmit} disabled={saving} className="bg-brand-gradient min-w-40 font-semibold">
              {saving ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
              ) : editingId ? (
                <><Pencil className="mr-1.5 h-4 w-4" /> Update Campaign</>
              ) : (
                <><Send className="mr-1.5 h-4 w-4" /> Publish Goal &amp; Distribution</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---------- existing campaigns ---------- */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <HeartHandshake className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" />
            Campaigns
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Every campaign with its distribution and live progress — {money(campaigns.reduce((s, c) => s + c.totalGoal, 0))} total goals set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading campaigns…
            </p>
          ) : campaigns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No campaign yet — set the first goal above and distribute it to the offices.
            </p>
          ) : (
            <div className="space-y-2.5">
              {campaigns.map((c) => {
                const st = campaignStatusStyle(c.status);
                return (
                  <div key={c.id} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <span className="truncate">{c.name}</span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${st.badge}`}>{st.label}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.startDate.slice(0, 10)} → {c.deadline.slice(0, 10)} · {c.assignments.length} office{c.assignments.length === 1 ? '' : 's'} · goal {money(c.totalGoal, c.currency)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="sm" className="h-8" onClick={() => startEdit(c)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Button>
                        {c.status === 'ACTIVE' ? (
                          <>
                            <Button variant="outline" size="sm" className="h-8 border-sky-300 text-sky-700" onClick={() => setStatus(c, 'COMPLETED')}>
                              <CircleCheck className="mr-1 h-3.5 w-3.5" /> Complete
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 border-rose-200 text-rose-600" onClick={() => setStatus(c, 'CANCELLED')}>
                              <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                            </Button>
                          </>
                        ) : (
                          <Button variant="outline" size="sm" className="h-8 border-emerald-300 text-emerald-700" onClick={() => setStatus(c, 'ACTIVE')}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-8 border-rose-200 text-rose-600" onClick={() => setDeleteId(c)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {c.analysis.offices.filter((o) => o.assigned).map((o) => (
                        <span key={o.departmentId} className="text-muted-foreground">
                          <span className="font-medium text-foreground/80">{o.departmentName}:</span>{' '}
                          {money(o.minimumAmount, c.currency)} · {pct(o.attainmentPct)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.analysis.progressPct}%` }} />
                      </div>
                      <span className="font-semibold">{pct(c.analysis.attainmentPct)}</span>
                      <span className="text-muted-foreground">({money(c.analysis.collected, c.currency)} collected)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* delete dialog */}
      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Delete campaign?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleteId?.name}&rdquo; and every achievement record under it will be permanently removed. The office-wise report will no longer be available.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Keep</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
