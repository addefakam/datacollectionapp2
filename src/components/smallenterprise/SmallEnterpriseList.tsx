'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Download,
  Trash2,
  Eye,
  Store,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileSpreadsheet,
  Pencil,
  Loader2,
  Save,
  Upload,
  Phone,
  MapPin,
  FileBadge,
  Coins,
  Home,
  GraduationCap,
  ArrowRightCircle,
} from 'lucide-react';
import { SMALL_ENTERPRISE_TYPES, SMALL_ENTERPRISE_OWNERSHIP_TYPES } from '@/lib/location-data';
import { hasSexBreakdown } from '@/lib/sex-counts';
import { SME_STATUSES, SME_STATUS_META, type SmeStatus } from '@/lib/sme';
import { useSettings } from '@/components/SettingsProvider';

interface SmallEnterprise {
  id: string;
  enterpriseName: string;
  enterpriseType: string;
  ownershipType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string | null;
  employeeCount: number;
  maleEmployees: number;
  femaleEmployees: number;
  startupCapital: number | null;
  hasPremises: boolean;
  hasTraining: boolean;
  status: string;
  statusUpdatedAt: string | null;
  statusNote: string | null;
  contactName: string;
  contactPhone: string;
  surveyorName: string | null;
  surveyorId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  enterpriseName: string;
  enterpriseType: string;
  ownershipType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  licenseNumber: string;
  employeeCount: string;
  maleEmployees: string;
  femaleEmployees: string;
  startupCapital: string;
  hasPremises: string;
  hasTraining: string;
  status: string;
  contactName: string;
  contactPhone: string;
}

interface DataListProps {
  refreshTrigger: number;
}

const PAGE_SIZE = 50;

function fmtDate(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
}

function fmtMoney(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en') + ' ETB';
}

export default function SmallEnterpriseList({ refreshTrigger }: DataListProps) {
  const { subCities, areasFor } = useSettings();
  const { toast } = useToast();
  const [data, setData] = useState<SmallEnterprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubCity, setFilterSubCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<SmallEnterprise | null>(null);
  const [editItem, setEditItem] = useState<SmallEnterprise | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editAreas, setEditAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [statusItem, setStatusItem] = useState<SmallEnterprise | null>(null);
  const [statusForm, setStatusForm] = useState<{ status: string; note: string }>({ status: 'REGISTERED', note: '' });
  const [savingStatus, setSavingStatus] = useState(false);

  // Bulk establishment-status modification (select records → apply / advance)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>('FULLY_LEGALIZED');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterType) params.set('enterpriseType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/smallenterprises?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [search, filterSubCity, filterArea, filterType, filterStatus, page, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleSubCityFilterChange = (value: string) => {
    setFilterSubCity(value);
    setFilterArea('');
    setPage(1);
    setAreas(value ? areasFor(value) : []);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/smallenterprises/${deleteId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Delete failed');
      toast({ title: 'Deleted', description: 'Record removed successfully.' });
      fetchData();
    } catch {
      toast({
        title: 'Delete Failed',
        description: 'Could not delete the record.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  /** Advance the establishment status of one enterprise (REGISTERED →
   * FULLY_LEGALIZED → AWAITING_OPERATION → OPERATIONAL). */
  const openStatusUpdate = (item: SmallEnterprise) => {
    setStatusItem(item);
    setStatusForm({ status: item.status || 'REGISTERED', note: item.statusNote || '' });
  };

  const submitStatusUpdate = async () => {
    if (!statusItem) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/smallenterprises/${statusItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusForm.status, statusNote: statusForm.note || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Status update failed');
      }
      toast({ title: 'Status Updated', description: `${statusItem.enterpriseName} is now ${SME_STATUS_META[statusForm.status as SmeStatus]?.label ?? statusForm.status}` });
      setStatusItem(null);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to update status', variant: 'destructive' });
    } finally {
      setSavingStatus(false);
    }
  };

  /** Bulk-modify the establishment status of the selected records — set one
   * status on all of them, or auto-advance each one stage along the lifecycle
   * REGISTERED → FULLY_LEGALIZED → AWAITING_OPERATION → OPERATIONAL. The
   * status date stamp is populated automatically by the API. */
  const submitBulkStatus = async (advance: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/smallenterprises/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selectedIds],
          ...(advance ? { advance: true } : { status: bulkStatus }),
          note: bulkNote || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Bulk update failed');
      toast({
        title: 'Status Updated',
        description: `${json.updated} record(s) updated${json.unchanged ? `, ${json.unchanged} already at that stage` : ''}.`,
      });
      setSelectedIds(new Set());
      setBulkNote('');
      fetchData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update records',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const openEdit = (item: SmallEnterprise) => {
    setEditItem(item);
    setEditForm({
      enterpriseName: item.enterpriseName,
      enterpriseType: item.enterpriseType,
      ownershipType: item.ownershipType,
      subCity: item.subCity,
      area: item.area,
      specificAddress: item.specificAddress,
      licenseNumber: item.licenseNumber || '',
      employeeCount: String(item.employeeCount),
      maleEmployees: String(item.maleEmployees || ''),
      femaleEmployees: String(item.femaleEmployees || ''),
      startupCapital: item.startupCapital != null ? String(item.startupCapital) : '',
      hasPremises: item.hasPremises ? 'yes' : 'no',
      hasTraining: item.hasTraining ? 'yes' : 'no',
      status: item.status || 'REGISTERED',
      contactName: item.contactName,
      contactPhone: item.contactPhone,
    });
    setEditAreas(areasFor(item.subCity));
  };

  const handleEditSubCityChange = (value: string) => {
    if (!editForm) return;
    setEditAreas(areasFor(value));
    setEditForm({ ...editForm, subCity: value, area: '' });
  };

  const handleSave = async () => {
    if (!editItem || !editForm) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/smallenterprises/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
      }
      toast({ title: 'Saved / Nuusame', description: 'Record updated successfully' });
      setEditItem(null);
      setEditForm(null);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async (format: 'csv' | 'excel') => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterType) params.set('enterpriseType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/smallenterprises/export${format === 'excel' ? '/excel' : ''}?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dhibayyuu_small_enterprise_survey_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Export Successful', description: `Downloaded ${format.toUpperCase()} file` });
    } catch (error) {
      toast({ title: 'Export Failed', description: error instanceof Error ? error.message : 'Failed to export', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/smallenterprises/import', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Import failed');
      }
      setImportResult({ success: json.success, failed: json.failed, errors: json.errors || [] });
      toast({
        title: 'Import Complete',
        description: `${json.success} records imported, ${json.failed} failed`,
        variant: json.failed > 0 ? 'destructive' : 'default',
      });
      fetchData();
    } catch (error) {
      toast({ title: 'Import Failed', description: error instanceof Error ? error.message : 'Failed to import', variant: 'destructive' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Card className="rounded-2xl border-teal-100">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Store className="h-5 w-5 text-amber-600" />
              Small Enterprise Records
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">{total}</Badge>
            </CardTitle>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => fetchData()} className="h-8 px-2">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="h-8 px-2 text-xs">
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            </div>
          </div>
          <CardDescription className="text-xs sm:text-sm">Manage all registered small enterprises (MSE)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, address, contact..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 text-sm"
              />
            </div>
            <Select value={filterSubCity} onValueChange={handleSubCityFilterChange}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All Sub-Cities" /></SelectTrigger>
              <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={filterArea} onValueChange={(v) => { setFilterArea(v); setPage(1); }} disabled={!filterSubCity}>
              <SelectTrigger className="text-sm"><SelectValue placeholder={filterSubCity ? 'All Werredas' : 'Select sub-city first'} /></SelectTrigger>
              <SelectContent>{areas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent className="max-h-64">{SMALL_ENTERPRISE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                {SME_STATUSES.map((s) => (<SelectItem key={s} value={s}>{SME_STATUS_META[s].label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('excel')} disabled={exporting} className="flex-1 text-xs sm:text-sm">
              {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />}
              Excel
            </Button>
          </div>

          {/* Bulk status modification bar */}
          {selectedIds.size > 0 && (
            <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="bg-white text-teal-800">{selectedIds.size} record(s) selected</Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setSelectedIds(new Set())}>
                  Clear selection
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Set status to</Label>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SME_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="font-medium">{SME_STATUS_META[s].label}</span>
                          <span className="block text-[10px] text-muted-foreground">{SME_STATUS_META[s].description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-status-note" className="text-xs">Note</Label>
                  <Input
                    id="bulk-status-note"
                    placeholder="Optional (e.g. license issued)"
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    className="h-9 w-52 text-sm"
                  />
                </div>
                <Button onClick={() => submitBulkStatus(false)} disabled={bulkBusy} className="h-9 bg-teal-700 text-white hover:bg-teal-800">
                  {bulkBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightCircle className="mr-1.5 h-4 w-4" />}
                  Apply
                </Button>
                <Button variant="outline" onClick={() => submitBulkStatus(true)} disabled={bulkBusy} className="h-9 border-teal-300 text-teal-800 hover:bg-teal-100">
                  {bulkBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightCircle className="mr-1.5 h-4 w-4" />}
                  Advance one stage
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Lifecycle: Registered → Fully Legalized → Awaiting Operation → Operational · the status date is stamped automatically on every change.
              </p>
            </div>
          )}

          {/* Records */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Store className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No small enterprise records found</p>
              <p className="text-xs text-muted-foreground">Collect a survey, import Excel, or adjust your filters</p>
            </div>
          ) : (
            <>
            {/* Select-all for bulk status modification */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                id="mse-select-all"
                checked={data.length > 0 && data.every((i) => selectedIds.has(i.id))}
                onCheckedChange={(v) => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (v) data.forEach((i) => next.add(i.id));
                    else data.forEach((i) => next.delete(i.id));
                    return next;
                  });
                }}
              />
              <label htmlFor="mse-select-all" className="cursor-pointer select-none">
                Select all on this page
              </label>
            </div>
            <div className="space-y-2.5">
              {data.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border bg-white p-3 transition-shadow hover:shadow-md ${
                    selectedIds.has(item.id) ? 'border-teal-300 ring-1 ring-teal-200' : 'border-teal-100'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Checkbox
                        className="mt-1"
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${item.enterpriseName}`}
                      />
                      <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-teal-950">{item.enterpriseName}</p>
                        <Badge
                          variant="outline"
                          className={"text-[10px] " + (SME_STATUS_META[(item.status as SmeStatus) in SME_STATUS_META ? (item.status as SmeStatus) : 'REGISTERED'].badgeClass)}
                        >
                          {SME_STATUS_META[(item.status as SmeStatus) in SME_STATUS_META ? (item.status as SmeStatus) : 'REGISTERED'].label}
                        </Badge>
                        <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800">{item.enterpriseType}</Badge>
                        <Badge variant="outline" className="text-[10px]">{item.ownershipType}</Badge>
                        {item.licenseNumber && (
                          <Badge variant="outline" className="gap-1 text-[10px] text-teal-700"><FileBadge className="h-2.5 w-2.5" />{item.licenseNumber}</Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.subCity} · {item.area}</span>
                        <span>{item.specificAddress}</span>
                        <a href={`tel:${item.contactPhone}`} className="flex items-center gap-1 font-medium text-amber-600 hover:underline">
                          <Phone className="h-3 w-3" />{item.contactName}
                        </a>
                        <span className="text-teal-900/40">{fmtDate(item.createdAt)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-medium text-teal-800">
                          <Store className="h-3 w-3" />{item.employeeCount} employees
                        </span>
                        {hasSexBreakdown(item.maleEmployees, item.femaleEmployees) && (
                          <>
                            <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-teal-700">M {item.maleEmployees}</span>
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">F {item.femaleEmployees}</span>
                          </>
                        )}
                        {item.startupCapital != null && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                            <Coins className="h-3 w-3" />{fmtMoney(item.startupCapital)}
                          </span>
                        )}
                        {item.hasPremises && <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-teal-700"><Home className="h-3 w-3" />Premises</span>}
                        {item.hasTraining && <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-teal-700"><GraduationCap className="h-3 w-3" />Trained</span>}
                        {item.surveyorName && <span className="text-muted-foreground">by {item.surveyorName}</span>}
                      </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-row gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewItem(item)} title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 border-teal-200 text-teal-700 hover:bg-teal-50" onClick={() => openStatusUpdate(item)} title="Update Status">
                        <ArrowRightCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(item)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 border-red-200 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(item.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total} records</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View dialog */}
      <Dialog open={!!viewItem} onOpenChange={(open) => !open && setViewItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {viewItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-amber-600" />
                  {viewItem.enterpriseName}
                </DialogTitle>
                <DialogDescription>{viewItem.enterpriseType} · {viewItem.ownershipType}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-slate-50 text-sm">
                {[
                  { label: 'Current Status / Sadarkaa', value: SME_STATUS_META[(viewItem.status as SmeStatus) in SME_STATUS_META ? (viewItem.status as SmeStatus) : 'REGISTERED'].label },
                  { label: 'Sub-City / Kututtaa Maggalaa', value: viewItem.subCity },
                  { label: 'Werreda', value: viewItem.area },
                  { label: 'Specific Address / Baka Addaa', value: viewItem.specificAddress },
                  { label: 'License No. / Lakofsaa Eyyeema', value: viewItem.licenseNumber || '—' },
                  { label: 'Employees / Hojjetaa', value: String(viewItem.employeeCount) },
                  { label: 'Male / Dhiira', value: String(viewItem.maleEmployees || '—') },
                  { label: 'Female / Dubartii', value: String(viewItem.femaleEmployees || '—') },
                  { label: 'Startup Capital', value: fmtMoney(viewItem.startupCapital) },
                  { label: 'Own Premises', value: viewItem.hasPremises ? 'Yes / Eyee' : 'No / Lakki' },
                  { label: 'MSE Training', value: viewItem.hasTraining ? 'Yes / Eyee' : 'No / Lakki' },
                  { label: 'Contact Person', value: viewItem.contactName },
                  { label: 'Contact Phone', value: viewItem.contactPhone },
                  { label: 'Surveyor', value: viewItem.surveyorName || '—' },
                  { label: 'Date Collected', value: fmtDate(viewItem.createdAt) },
                ].map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
                    <span className="shrink-0 text-[11px] text-muted-foreground sm:text-xs">{row.label}</span>
                    <span className="text-right text-xs font-medium sm:text-sm">{row.value}</span>
                  </div>
                ))}
              </div>
              <a href={`tel:${viewItem.contactPhone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 hover:underline">
                <Phone className="h-4 w-4" /> {viewItem.contactPhone}
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) { setEditItem(null); setEditForm(null); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {editItem && editForm && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-amber-600" />
                  Edit Small Enterprise
                </DialogTitle>
                <DialogDescription>{editItem.enterpriseName}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-enterpriseName" className="text-xs">Enterprise Name</Label>
                  <Input id="edit-enterpriseName" value={editForm.enterpriseName} onChange={(e) => setEditForm({ ...editForm, enterpriseName: e.target.value })} className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Enterprise Type</Label>
                    <Select value={editForm.enterpriseType} onValueChange={(v) => setEditForm({ ...editForm, enterpriseType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">{SMALL_ENTERPRISE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ownership</Label>
                    <Select value={editForm.ownershipType} onValueChange={(v) => setEditForm({ ...editForm, ownershipType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">{SMALL_ENTERPRISE_OWNERSHIP_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sub-City</Label>
                    <Select value={editForm.subCity} onValueChange={handleEditSubCityChange}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{subCities.map((sc) => (<SelectItem key={sc.name} value={sc.name}>{sc.name}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Werreda</Label>
                    <Select value={editForm.area} onValueChange={(v) => setEditForm({ ...editForm, area: v })} disabled={!editForm.subCity}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{editAreas.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-specificAddress" className="text-xs">Specific Address</Label>
                  <Input id="edit-specificAddress" value={editForm.specificAddress} onChange={(e) => setEditForm({ ...editForm, specificAddress: e.target.value })} className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-licenseNumber" className="text-xs">License Number</Label>
                    <Input id="edit-licenseNumber" value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-startupCapital" className="text-xs">Startup Capital (ETB)</Label>
                    <Input id="edit-startupCapital" type="number" min="0" step="any" value={editForm.startupCapital} onChange={(e) => setEditForm({ ...editForm, startupCapital: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-employeeCount" className="text-xs">Employees</Label>
                    <Input id="edit-employeeCount" type="number" min="0" value={editForm.employeeCount} onChange={(e) => setEditForm({ ...editForm, employeeCount: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-maleEmployees" className="text-xs">Male</Label>
                    <Input id="edit-maleEmployees" type="number" min="0" value={editForm.maleEmployees} onChange={(e) => setEditForm({ ...editForm, maleEmployees: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-femaleEmployees" className="text-xs">Female</Label>
                    <Input id="edit-femaleEmployees" type="number" min="0" value={editForm.femaleEmployees} onChange={(e) => setEditForm({ ...editForm, femaleEmployees: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Own Premises</Label>
                    <Select value={editForm.hasPremises} onValueChange={(v) => setEditForm({ ...editForm, hasPremises: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes / Eyee</SelectItem>
                        <SelectItem value="no">No / Lakki</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">MSE Training</Label>
                    <Select value={editForm.hasTraining} onValueChange={(v) => setEditForm({ ...editForm, hasTraining: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes / Eyee</SelectItem>
                        <SelectItem value="no">No / Lakki</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Establishment Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SME_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{SME_STATUS_META[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-contactName" className="text-xs">Contact Person</Label>
                    <Input id="edit-contactName" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-contactPhone" className="text-xs">Contact Phone</Label>
                    <Input id="edit-contactPhone" type="tel" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} className="text-sm" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditItem(null); setEditForm(null); }}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="bg-amber-600 text-white hover:bg-amber-700">
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Update status dialog */}
      <Dialog open={!!statusItem} onOpenChange={(open) => { if (!open) setStatusItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightCircle className="h-5 w-5 text-teal-700" />
              Update Establishment Status
            </DialogTitle>
            <DialogDescription>{statusItem?.enterpriseName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">New Status</Label>
              <Select value={statusForm.status} onValueChange={(v) => setStatusForm({ ...statusForm, status: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SME_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="font-medium">{SME_STATUS_META[s].label}</span>
                      <span className="block text-[10px] text-muted-foreground">{SME_STATUS_META[s].description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status-note" className="text-xs">Note</Label>
              <Input
                id="status-note"
                placeholder="Optional note (e.g., license issued, started operation)"
                value={statusForm.note}
                onChange={(e) => setStatusForm({ ...statusForm, note: e.target.value })}
                className="text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Lifecycle: Registered → Fully Legalized → Awaiting Operation → Operational</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusItem(null)}>Cancel</Button>
            <Button onClick={submitStatusUpdate} disabled={savingStatus} className="bg-teal-700 text-white hover:bg-teal-800">
              {savingStatus ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightCircle className="mr-1.5 h-4 w-4" />}
              Save Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the small enterprise record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white hover:bg-red-700">
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-amber-600" />
              Bulk Import / Galmeessaa Keessaa
            </DialogTitle>
            <DialogDescription>
              Upload an Excel file following the template format
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button variant="outline" size="sm" className="w-full" onClick={() => window.open('/api/smallenterprises/import/template', '_blank')}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Download Template / Foormaa Buufadhu
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" id="mse-import-file" />
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-4 w-4" />
                  Fiilii Excel Dabali / Drop Excel File
                </>
              )}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">.xlsx files only</p>
            {importResult && (
              <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3 text-xs">
                <p className="font-semibold text-teal-900">{importResult.success} imported, {importResult.failed} failed</p>
                {importResult.errors.length > 0 && (
                  <div className="mt-1.5 max-h-28 overflow-y-auto text-red-600">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <p key={i} className="leading-snug">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
