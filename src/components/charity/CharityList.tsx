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
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Download,
  Trash2,
  Eye,
  HeartHandshake,
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
  Users,
  BadgeCheck,
} from 'lucide-react';
import { CHARITY_TYPES, CHARITY_ORGANIZATION_TYPES } from '@/lib/location-data';
import { hasSexBreakdown } from '@/lib/sex-counts';
import { useSettings } from '@/components/SettingsProvider';

interface Charity {
  id: string;
  organizationName: string;
  organizationType: string;
  charityType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  registrationNumber: string | null;
  beneficiaryCount: number;
  maleBeneficiaries: number;
  femaleBeneficiaries: number;
  volunteerCount: number;
  annualBudget: number | null;
  hasLegalRegistration: boolean;
  contactName: string;
  contactPhone: string;
  surveyorName: string | null;
  surveyorId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  organizationName: string;
  organizationType: string;
  charityType: string;
  subCity: string;
  area: string;
  specificAddress: string;
  registrationNumber: string;
  beneficiaryCount: string;
  maleBeneficiaries: string;
  femaleBeneficiaries: string;
  volunteerCount: string;
  annualBudget: string;
  hasLegalRegistration: string;
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

export default function CharityList({ refreshTrigger }: DataListProps) {
  const { subCities, areasFor } = useSettings();
  const { toast } = useToast();
  const [data, setData] = useState<Charity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSubCity, setFilterSubCity] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterType, setFilterType] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Charity | null>(null);
  const [editItem, setEditItem] = useState<Charity | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editAreas, setEditAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterSubCity) params.set('subCity', filterSubCity);
      if (filterArea) params.set('area', filterArea);
      if (filterType) params.set('charityType', filterType);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const res = await fetch(`/api/charities?${params}`);
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
  }, [search, filterSubCity, filterArea, filterType, page, toast]);

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
      const res = await fetch(`/api/charities/${deleteId}`, {
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

  const openEdit = (item: Charity) => {
    setEditItem(item);
    setEditForm({
      organizationName: item.organizationName,
      organizationType: item.organizationType,
      charityType: item.charityType,
      subCity: item.subCity,
      area: item.area,
      specificAddress: item.specificAddress,
      registrationNumber: item.registrationNumber || '',
      beneficiaryCount: String(item.beneficiaryCount),
      maleBeneficiaries: String(item.maleBeneficiaries || ''),
      femaleBeneficiaries: String(item.femaleBeneficiaries || ''),
      volunteerCount: String(item.volunteerCount || ''),
      annualBudget: item.annualBudget != null ? String(item.annualBudget) : '',
      hasLegalRegistration: item.hasLegalRegistration ? 'yes' : 'no',
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
      const res = await fetch(`/api/charities/${editItem.id}`, {
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
      if (filterType) params.set('charityType', filterType);
      const res = await fetch(`/api/charities/export${format === 'excel' ? '/excel' : ''}?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dhibayyuu_charity_survey_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
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
      const res = await fetch('/api/charities/import', {
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
              <HeartHandshake className="h-5 w-5 text-amber-600" />
              Bussa Goonofa / Charity Records
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
          <CardDescription className="text-xs sm:text-sm">Manage all registered charity organizations (Bussa Goonofa)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              <SelectTrigger className="text-sm"><SelectValue placeholder="All Charity Types" /></SelectTrigger>
              <SelectContent className="max-h-64">{CHARITY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
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

          {/* Records */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <HeartHandshake className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No charity records found</p>
              <p className="text-xs text-muted-foreground">Collect a survey, import Excel, or adjust your filters</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.map((item) => (
                <div key={item.id} className="rounded-xl border border-teal-100 bg-white p-3 transition-shadow hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-teal-950">{item.organizationName}</p>
                        <Badge variant="secondary" className="bg-amber-100 text-[10px] text-amber-800">{item.charityType}</Badge>
                        <Badge variant="outline" className="text-[10px]">{item.organizationType}</Badge>
                        {item.registrationNumber && (
                          <Badge variant="outline" className="gap-1 text-[10px] text-teal-700"><FileBadge className="h-2.5 w-2.5" />{item.registrationNumber}</Badge>
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
                          <Users className="h-3 w-3" />{item.beneficiaryCount} beneficiaries
                        </span>
                        {hasSexBreakdown(item.maleBeneficiaries, item.femaleBeneficiaries) && (
                          <>
                            <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-teal-700">M {item.maleBeneficiaries}</span>
                            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700">F {item.femaleBeneficiaries}</span>
                          </>
                        )}
                        {item.volunteerCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 font-medium text-teal-800">
                            <HeartHandshake className="h-3 w-3" />{item.volunteerCount} volunteers
                          </span>
                        )}
                        {item.annualBudget != null && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                            <Coins className="h-3 w-3" />{fmtMoney(item.annualBudget)}
                          </span>
                        )}
                        {item.hasLegalRegistration && <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-1.5 py-0.5 text-teal-700"><BadgeCheck className="h-3 w-3" />Registered</span>}
                        {item.surveyorName && <span className="text-muted-foreground">by {item.surveyorName}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-row gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewItem(item)} title="View">
                        <Eye className="h-3.5 w-3.5" />
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
                  <HeartHandshake className="h-5 w-5 text-amber-600" />
                  {viewItem.organizationName}
                </DialogTitle>
                <DialogDescription>{viewItem.charityType} · {viewItem.organizationType}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-slate-50 text-sm">
                {[
                  { label: 'Sub-City / Kututtaa Maggalaa', value: viewItem.subCity },
                  { label: 'Werreda', value: viewItem.area },
                  { label: 'Specific Address / Baka Addaa', value: viewItem.specificAddress },
                  { label: 'Registration No.', value: viewItem.registrationNumber || '—' },
                  { label: 'Beneficiaries / Daddachaa', value: String(viewItem.beneficiaryCount) },
                  { label: 'Male / Dhiira', value: String(viewItem.maleBeneficiaries || '—') },
                  { label: 'Female / Dubartii', value: String(viewItem.femaleBeneficiaries || '—') },
                  { label: 'Volunteers', value: String(viewItem.volunteerCount || '—') },
                  { label: 'Annual Budget', value: fmtMoney(viewItem.annualBudget) },
                  { label: 'Legally Registered', value: viewItem.hasLegalRegistration ? 'Yes / Eyee' : 'No / Lakki' },
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
                  Edit Charity Organization
                </DialogTitle>
                <DialogDescription>{editItem.organizationName}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-organizationName" className="text-xs">Organization Name</Label>
                  <Input id="edit-organizationName" value={editForm.organizationName} onChange={(e) => setEditForm({ ...editForm, organizationName: e.target.value })} className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organization Type</Label>
                    <Select value={editForm.organizationType} onValueChange={(v) => setEditForm({ ...editForm, organizationType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">{CHARITY_ORGANIZATION_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Charity Type</Label>
                    <Select value={editForm.charityType} onValueChange={(v) => setEditForm({ ...editForm, charityType: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">{CHARITY_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent>
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
                    <Label htmlFor="edit-registrationNumber" className="text-xs">Registration Number</Label>
                    <Input id="edit-registrationNumber" value={editForm.registrationNumber} onChange={(e) => setEditForm({ ...editForm, registrationNumber: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-annualBudget" className="text-xs">Annual Budget (ETB)</Label>
                    <Input id="edit-annualBudget" type="number" min="0" step="any" value={editForm.annualBudget} onChange={(e) => setEditForm({ ...editForm, annualBudget: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-beneficiaryCount" className="text-xs">Beneficiaries</Label>
                    <Input id="edit-beneficiaryCount" type="number" min="0" value={editForm.beneficiaryCount} onChange={(e) => setEditForm({ ...editForm, beneficiaryCount: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-maleBeneficiaries" className="text-xs">Male</Label>
                    <Input id="edit-maleBeneficiaries" type="number" min="0" value={editForm.maleBeneficiaries} onChange={(e) => setEditForm({ ...editForm, maleBeneficiaries: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-femaleBeneficiaries" className="text-xs">Female</Label>
                    <Input id="edit-femaleBeneficiaries" type="number" min="0" value={editForm.femaleBeneficiaries} onChange={(e) => setEditForm({ ...editForm, femaleBeneficiaries: e.target.value })} className="text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-volunteerCount" className="text-xs">Volunteers</Label>
                    <Input id="edit-volunteerCount" type="number" min="0" value={editForm.volunteerCount} onChange={(e) => setEditForm({ ...editForm, volunteerCount: e.target.value })} className="text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Legally Registered</Label>
                    <Select value={editForm.hasLegalRegistration} onValueChange={(v) => setEditForm({ ...editForm, hasLegalRegistration: v })}>
                      <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes / Eyee</SelectItem>
                        <SelectItem value="no">No / Lakki</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the charity organization record. This action cannot be undone.
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
            <Button variant="outline" size="sm" className="w-full" onClick={() => window.open('/api/charities/import/template', '_blank')}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Download Template / Foormaa Buufadhu
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" id="charity-import-file" />
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
